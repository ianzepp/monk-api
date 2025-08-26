import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { FtpTransactionManager, type FtpTransaction } from '@src/routes/ftp/store.js';

// Enhanced FTP Delete Transport Types (Phase 3)
export interface FtpDeleteRequest {
    path: string;                   // Path to delete - "/data/users/user-123" or "/data/users/user-123/email"
    ftp_options: {
        recursive: boolean;         // Directory deletion (cascade records/fields)
        force: boolean;             // Override soft-delete protections  
        permanent: boolean;         // Hard delete vs soft delete
        confirm_count?: number;     // Expected number of deletions for safety
        atomic: boolean;            // Atomic operation (default: true)
    };
    safety_checks?: {
        require_empty?: boolean;    // Require directory to be empty
        max_deletions?: number;     // Safety limit for batch operations
        confirmation_token?: string; // Additional confirmation for dangerous operations
    };
    metadata?: {
        transaction_id?: string;    // Existing transaction to join
        reason?: string;            // Reason for deletion (for audit)
    };
}

// Enhanced FTP Delete Response (Phase 3)
export interface FtpDeleteResponse {
    success: true;
    operation: 'soft_delete' | 'permanent_delete' | 'hard_delete' | 'field_delete';
    results: {
        deleted_count: number;
        paths: string[];            // Actually deleted paths
        records_affected: string[]; // Record IDs that were affected
        fields_cleared?: string[];  // Fields that were cleared (for field operations)
        skipped: {                  // Items that couldn't be deleted
            path: string;
            reason: string;
            details?: string;
        }[];
    };
    ftp_metadata: {
        can_restore: boolean;       // Can be restored via soft delete recovery
        restore_deadline?: string;  // When permanent deletion occurs
        backup_location?: string;   // Where backup is stored (if applicable)
    };
    transaction_info?: {
        transaction_id: string;     // Transaction ID if atomic operation
        can_rollback: boolean;      // Whether rollback is possible
        timeout_ms: number;         // Transaction timeout
    };
    warnings?: string[];           // Non-fatal warnings
}

/**
 * Enhanced FTP Delete Path Parser (Phase 3)
 */
class FtpDeletePathParser {
    static parse(path: string): FtpDeletePath {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);
        
        if (parts.length === 0) {
            throw new Error('Cannot delete root path');
        }
        
        // /data or /meta paths only
        if (parts[0] !== 'data' && parts[0] !== 'meta') {
            throw new Error('FTP delete only supports /data and /meta paths');
        }
        
        const apiType = parts[0] as 'data' | 'meta';
        
        // /data/schema (delete entire schema - dangerous)
        if (parts.length === 2) {
            return {
                api_type: apiType,
                operation_type: 'schema',
                schema: parts[1],
                is_dangerous: true
            };
        }
        
        // /data/schema/record-id or /data/schema/record-id.json
        if (parts.length === 3) {
            const schemaName = parts[1];
            let recordId = parts[2];
            
            // Handle .json extension
            const isJsonFile = recordId.endsWith('.json');
            if (isJsonFile) {
                recordId = recordId.slice(0, -5); // Remove .json extension
            }
            
            return {
                api_type: apiType,
                operation_type: 'record',
                schema: schemaName,
                record_id: recordId,
                is_json_file: isJsonFile
            };
        }
        
        // /data/schema/record-id/field
        if (parts.length === 4) {
            const schemaName = parts[1];
            const recordId = parts[2];
            const fieldName = parts[3];
            
            return {
                api_type: apiType,
                operation_type: 'field',
                schema: schemaName,
                record_id: recordId,
                field_name: fieldName
            };
        }
        
        throw new Error(`Invalid FTP delete path format: ${path} - too many path components`);
    }
    
    static validate(path: string): boolean {
        try {
            this.parse(path);
            return true;
        } catch {
            return false;
        }
    }
}

export interface FtpDeletePath {
    api_type: 'data' | 'meta';
    operation_type: 'schema' | 'record' | 'field';
    schema: string;
    record_id?: string;
    field_name?: string;
    is_json_file?: boolean;        // Whether path ends with .json
    is_dangerous?: boolean;        // Whether this is a dangerous operation
}

/**
 * FTP Delete Permission Validator (Phase 3)
 */
class FtpDeletePermissionValidator {
    static async validateDeletePermission(
        system: any, 
        path: FtpDeletePath, 
        options: FtpDeleteRequest['ftp_options']
    ): Promise<DeleteValidationResult> {
        const user = system.getUser();
        
        // Root user has all permissions
        if (system.isRoot()) {
            return { allowed: true, reason: 'root_user' };
        }
        
        try {
            // Schema-level deletion is very dangerous
            if (path.operation_type === 'schema') {
                if (!options.force) {
                    return {
                        allowed: false,
                        reason: 'schema_deletion_requires_force',
                        details: 'Schema deletion requires force=true flag'
                    };
                }
                
                // Only allow schema deletion for admin users
                // TODO: Implement proper admin role checking
                return {
                    allowed: false,
                    reason: 'schema_deletion_forbidden',
                    details: 'Schema deletion requires administrator privileges'
                };
            }
            
            // For record operations, check if record exists and user has permission
            if (path.operation_type === 'record') {
                const existingRecord = await system.database.selectOne(path.schema, {
                    where: { id: path.record_id }
                });
                
                if (!existingRecord) {
                    return {
                        allowed: false,
                        reason: 'record_not_found',
                        details: `Record ${path.record_id} not found in schema ${path.schema}`
                    };
                }
                
                // Check for soft delete protection
                if (existingRecord.trashed_at && !options.force) {
                    return {
                        allowed: false,
                        reason: 'already_soft_deleted',
                        details: 'Record is already soft deleted. Use force=true for permanent deletion.'
                    };
                }
                
                // Check user permissions
                const hasDeletePermission = this.hasPermission(user, existingRecord, ['access_full']);
                if (!hasDeletePermission) {
                    return {
                        allowed: false,
                        reason: 'insufficient_permissions',
                        details: 'User lacks full access permission for record deletion'
                    };
                }
                
                return { allowed: true, reason: 'record_permission_verified' };
            }
            
            // For field operations, check the record exists and user has edit permission
            if (path.operation_type === 'field') {
                const existingRecord = await system.database.selectOne(path.schema, {
                    where: { id: path.record_id }
                });
                
                if (!existingRecord) {
                    return {
                        allowed: false,
                        reason: 'record_not_found',
                        details: `Record ${path.record_id} not found in schema ${path.schema}`
                    };
                }
                
                // Check if field exists
                if (!(path.field_name! in existingRecord)) {
                    return {
                        allowed: false,
                        reason: 'field_not_found',
                        details: `Field ${path.field_name} not found in record`
                    };
                }
                
                // Check user permissions for field modification
                const hasEditPermission = this.hasPermission(user, existingRecord, ['access_edit', 'access_full']);
                if (!hasEditPermission) {
                    return {
                        allowed: false,
                        reason: 'insufficient_permissions',
                        details: 'User lacks edit permission for field deletion'
                    };
                }
                
                return { allowed: true, reason: 'field_permission_verified' };
            }
            
            return { allowed: false, reason: 'unknown_operation_type' };
            
        } catch (error) {
            return {
                allowed: false,
                reason: 'permission_check_failed',
                details: error instanceof Error ? error.message : String(error)
            };
        }
    }
    
    private static hasPermission(user: any, record: any, requiredPermissions: string[]): boolean {
        const userContext = [user.id, ...(user.accessRead || [])];
        
        for (const permission of requiredPermissions) {
            const recordPermissions = record[permission] || [];
            if (recordPermissions.some((id: string) => userContext.includes(id))) {
                return true;
            }
        }
        
        return false;
    }
}

export interface DeleteValidationResult {
    allowed: boolean;
    reason: string;
    details?: string;
}

/**
 * DELETE operation handlers (Phase 3)
 */
class FtpDeleteOperations {
    static async executeRecordDelete(
        system: any,
        path: FtpDeletePath,
        options: FtpDeleteRequest['ftp_options']
    ): Promise<DeleteOperationResult> {
        const recordId = path.record_id!;
        
        if (options.permanent) {
            // Permanent deletion (hard delete)
            const result = await system.database.deleteOne(path.schema, recordId, { 
                permanent: true 
            });
            
            return {
                operation: 'permanent_delete',
                deleted_count: result ? 1 : 0,
                records_affected: result ? [recordId] : [],
                can_restore: false
            };
        } else {
            // Soft deletion (set trashed_at)
            const result = await system.database.updateOne(path.schema, recordId, {
                trashed_at: new Date().toISOString()
            });
            
            return {
                operation: 'soft_delete',
                deleted_count: result ? 1 : 0,
                records_affected: result ? [recordId] : [],
                can_restore: true,
                restore_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
            };
        }
    }
    
    static async executeFieldDelete(
        system: any,
        path: FtpDeletePath,
        options: FtpDeleteRequest['ftp_options']
    ): Promise<DeleteOperationResult> {
        const recordId = path.record_id!;
        const fieldName = path.field_name!;
        
        // Field deletion means clearing the field value
        const updateData: any = {};
        updateData[fieldName] = null;
        
        const result = await system.database.updateOne(path.schema, recordId, updateData);
        
        return {
            operation: 'field_delete',
            deleted_count: result ? 1 : 0,
            records_affected: result ? [recordId] : [],
            fields_cleared: [fieldName],
            can_restore: false // Field values can't be restored automatically
        };
    }
    
    static async executeSchemaDelete(
        system: any,
        path: FtpDeletePath,
        options: FtpDeleteRequest['ftp_options']
    ): Promise<DeleteOperationResult> {
        // This is a very dangerous operation
        throw new Error('Schema deletion not implemented - too dangerous for current Phase');
        
        // Future implementation would:
        // 1. Count all records in schema
        // 2. Validate against confirm_count if provided
        // 3. Either soft-delete all records or drop schema entirely
        // 4. Provide comprehensive rollback capability
    }
}

export interface DeleteOperationResult {
    operation: 'soft_delete' | 'permanent_delete' | 'hard_delete' | 'field_delete';
    deleted_count: number;
    records_affected: string[];
    fields_cleared?: string[];
    can_restore: boolean;
    restore_deadline?: string;
}

/**
 * POST /ftp/delete - Enhanced File Deletion Middleware (Phase 3)
 * 
 * Advanced file deletion endpoint supporting soft/hard deletes, field clearing,
 * transaction management, and comprehensive safety checks.
 */
export default async function ftpDeleteHandler(context: Context): Promise<any> {
    const system = context.get('system');
    const requestBody: FtpDeleteRequest = await context.req.json();
    
    if (!system) {
        throw new Error('System context not available - ensure systemContextMiddleware is applied');
    }
    
    // Start timing for performance metrics
    const startTime = process.hrtime.bigint();
    
    logger.info('FTP delete operation (Phase 3)', {
        path: requestBody.path,
        options: requestBody.ftp_options,
        safetyChecks: requestBody.safety_checks
    });
    
    let transactionId: string | undefined;
    
    try {
        // Default options with safety-first approach
        const options = {
            ...requestBody.ftp_options,
            recursive: requestBody.ftp_options.recursive ?? false,
            force: requestBody.ftp_options.force ?? false,
            permanent: requestBody.ftp_options.permanent ?? false,
            atomic: requestBody.ftp_options.atomic ?? true
        };
        
        // Parse FTP path to understand the delete operation
        const ftpPath = FtpDeletePathParser.parse(requestBody.path);
        
        // Safety check for dangerous operations
        if (ftpPath.is_dangerous && !options.force) {
            throw new Error('Dangerous operation detected - requires force=true flag');
        }
        
        // Start transaction if atomic operation requested
        if (options.atomic && !requestBody.metadata?.transaction_id) {
            transactionId = await FtpTransactionManager.beginTransaction(
                system,
                'delete',
                requestBody.path
            );
        } else if (requestBody.metadata?.transaction_id) {
            transactionId = requestBody.metadata.transaction_id;
        }
        
        // Validate permissions
        const permissionCheck = await FtpDeletePermissionValidator.validateDeletePermission(
            system,
            ftpPath,
            options
        );
        
        if (!permissionCheck.allowed) {
            throw new Error(`Delete permission denied: ${permissionCheck.reason}${permissionCheck.details ? ' - ' + permissionCheck.details : ''}`);
        }
        
        let operationResult: DeleteOperationResult;
        
        // Execute the delete operation
        switch (ftpPath.operation_type) {
            case 'record':
                operationResult = await FtpDeleteOperations.executeRecordDelete(
                    system,
                    ftpPath,
                    options
                );
                break;
                
            case 'field':
                operationResult = await FtpDeleteOperations.executeFieldDelete(
                    system,
                    ftpPath,
                    options
                );
                break;
                
            case 'schema':
                operationResult = await FtpDeleteOperations.executeSchemaDelete(
                    system,
                    ftpPath,
                    options
                );
                break;
                
            default:
                throw new Error(`Unsupported delete operation type: ${ftpPath.operation_type}`);
        }
        
        // Commit transaction if we started one
        if (transactionId && options.atomic) {
            await FtpTransactionManager.commitTransaction(transactionId);
        }
        
        // Calculate performance metrics
        const totalTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        
        // Build response
        const response: FtpDeleteResponse = {
            success: true,
            operation: operationResult.operation,
            results: {
                deleted_count: operationResult.deleted_count,
                paths: [requestBody.path],
                records_affected: operationResult.records_affected,
                fields_cleared: operationResult.fields_cleared,
                skipped: [] // No skipped items in current implementation
            },
            ftp_metadata: {
                can_restore: operationResult.can_restore,
                restore_deadline: operationResult.restore_deadline
            },
            transaction_info: transactionId ? {
                transaction_id: transactionId,
                can_rollback: false, // Transaction already committed
                timeout_ms: 30000
            } : undefined
        };
        
        logger.info('FTP delete completed (Phase 3)', {
            path: requestBody.path,
            operation: operationResult.operation,
            deletedCount: operationResult.deleted_count,
            recordsAffected: operationResult.records_affected.length,
            totalTimeMs: Math.round(totalTime * 100) / 100,
            transactionId
        });
        
        setRouteResult(context, response);
        
    } catch (error) {
        // Rollback transaction if needed
        if (transactionId) {
            try {
                await FtpTransactionManager.rollbackTransaction(transactionId);
            } catch (rollbackError) {
                logger.warn('Failed to rollback delete transaction', {
                    transactionId,
                    rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                });
            }
        }
        
        logger.warn('FTP delete failed', {
            path: requestBody.path,
            error: error instanceof Error ? error.message : String(error),
            transactionId
        });
        
        throw error;
    }
}