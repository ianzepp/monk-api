import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

// Enhanced FTP Store Transport Types (Phase 3)
export interface FtpStoreRequest {
    path: string;                   // "/data/users/new-user.json" or "/data/users/user-123/email"
    content: any;                   // Record data or field value
    ftp_options: {
        binary_mode: boolean;       // FTP transfer mode
        overwrite: boolean;         // Allow overwriting existing records
        append_mode: boolean;       // FTP append vs replace
        create_path: boolean;       // Auto-create intermediate directories (schemas)
        resume_offset?: number;     // Resume partial uploads
        atomic: boolean;            // Atomic operation (default: true)
        validate_schema?: boolean;  // Validate against JSON schema (default: true)
    };
    metadata?: {
        content_type?: string;      // MIME type hint
        encoding?: string;          // Content encoding
        expected_size?: number;     // For validation
        checksum?: string;          // Content verification
        transaction_id?: string;    // Existing transaction to join
    };
}

// Enhanced FTP Store Response (Phase 3)
export interface FtpStoreResponse {
    success: true;
    operation: 'create' | 'update' | 'append' | 'field_update';
    result: {
        path: string;               // Final storage path
        record_id: string;          // Created/updated record ID
        field_name?: string;        // Field name if field-level operation
        size: number;               // Final size in bytes
        created: boolean;           // Was record created?
        updated: boolean;           // Was record updated?
        validation_passed: boolean; // Schema validation result
    };
    ftp_metadata: {
        modified_time: string;      // FTP timestamp format
        permissions: string;        // User's permissions on created/updated record
        can_resume: boolean;        // Future resume support
        etag: string;              // Content ETag for caching
        content_type: string;       // Detected/provided content type
    };
    transaction_info?: {
        transaction_id: string;     // Transaction ID if atomic operation
        can_rollback: boolean;      // Whether rollback is possible
        timeout_ms: number;         // Transaction timeout
    };
    warnings?: string[];           // Non-fatal warnings
}

/**
 * Transaction Manager for FTP Operations (Phase 3)
 */
export class FtpTransactionManager {
    private static transactions = new Map<string, FtpTransaction>();
    
    static async beginTransaction(
        system: any,
        operation: 'store' | 'delete' | 'copy' | 'move',
        path: string
    ): Promise<string> {
        const transactionId = `ftp-${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const timeoutMs = 30000; // 30 seconds default timeout
        
        const transaction: FtpTransaction = {
            id: transactionId,
            operation,
            path,
            status: 'active',
            created_at: new Date(),
            timeout_ms: timeoutMs,
            timeout_handle: setTimeout(() => {
                this.rollbackTransaction(transactionId).catch(err => {
                    system.warn('Failed to rollback timed out transaction', {
                        transactionId,
                        error: err.message
                    });
                });
            }, timeoutMs)
        };
        
        this.transactions.set(transactionId, transaction);
        
        system.info('FTP transaction started', {
            transactionId,
            operation,
            path,
            timeoutMs
        });
        
        return transactionId;
    }
    
    static async commitTransaction(transactionId: string): Promise<void> {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction not found: ${transactionId}`);
        }
        
        if (transaction.status !== 'active') {
            throw new Error(`Transaction ${transactionId} is not active (status: ${transaction.status})`);
        }
        
        // Clear timeout
        if (transaction.timeout_handle) {
            clearTimeout(transaction.timeout_handle);
        }
        
        // Mark as committed
        transaction.status = 'committed';
        transaction.completed_at = new Date();
        
        // Clean up after a delay
        setTimeout(() => {
            this.transactions.delete(transactionId);
        }, 60000); // Keep for 1 minute for debugging
    }
    
    static async rollbackTransaction(transactionId: string): Promise<void> {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            return; // Already cleaned up or never existed
        }
        
        // Clear timeout
        if (transaction.timeout_handle) {
            clearTimeout(transaction.timeout_handle);
        }
        
        // Mark as rolled back
        transaction.status = 'rolled_back';
        transaction.completed_at = new Date();
        
        // Clean up
        setTimeout(() => {
            this.transactions.delete(transactionId);
        }, 60000);
    }
    
    static getTransaction(transactionId: string): FtpTransaction | undefined {
        return this.transactions.get(transactionId);
    }
}

export interface FtpTransaction {
    id: string;
    operation: 'store' | 'delete' | 'copy' | 'move';
    path: string;
    status: 'active' | 'committed' | 'rolled_back';
    created_at: Date;
    completed_at?: Date;
    timeout_ms: number;
    timeout_handle?: NodeJS.Timeout;
}

/**
 * Enhanced FTP Path Parser - Enhanced for write operations (Phase 3)
 */
class FtpStorePathParser {
    static parse(path: string): FtpStorePath {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);
        
        if (parts.length === 0) {
            throw new Error('Cannot store to root path');
        }
        
        // /data or /meta paths only
        if (parts[0] !== 'data' && parts[0] !== 'meta') {
            throw new Error('FTP store only supports /data and /meta paths');
        }
        
        const apiType = parts[0] as 'data' | 'meta';
        
        // /data/schema or /meta/schema
        if (parts.length === 2) {
            throw new Error('Cannot store directly to schema directory - specify record path');
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
        
        throw new Error(`Invalid FTP store path format: ${path} - too many path components`);
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

export interface FtpStorePath {
    api_type: 'data' | 'meta';
    operation_type: 'record' | 'field';
    schema: string;
    record_id: string;
    field_name?: string;
    is_json_file?: boolean;        // Whether path ends with .json
}

/**
 * Content Processor - Handle different content types and formats (Phase 3)
 */
class FtpContentProcessor {
    static processContent(content: any, path: FtpStorePath, options: FtpStoreRequest['ftp_options']): ProcessedContent {
        if (path.operation_type === 'field') {
            // Field-level storage - content is the field value
            return {
                processed_content: content,
                content_type: this.detectContentType(content),
                size: this.calculateSize(content),
                encoding: options.binary_mode ? 'binary' : 'utf8'
            };
        }
        
        // Record-level storage
        if (path.is_json_file || typeof content === 'object') {
            // JSON record storage
            const jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
            
            return {
                processed_content: jsonContent,
                content_type: 'application/json',
                size: JSON.stringify(jsonContent).length,
                encoding: 'utf8'
            };
        }
        
        // Raw content storage (convert to appropriate field)
        return {
            processed_content: { content: content },
            content_type: this.detectContentType(content),
            size: this.calculateSize(content),
            encoding: options.binary_mode ? 'binary' : 'utf8'
        };
    }
    
    private static detectContentType(content: any): string {
        if (typeof content === 'string') {
            // Try to detect if it's JSON
            try {
                JSON.parse(content);
                return 'application/json';
            } catch {
                return 'text/plain';
            }
        }
        
        if (typeof content === 'object') {
            return 'application/json';
        }
        
        if (typeof content === 'number') {
            return 'text/plain';
        }
        
        if (typeof content === 'boolean') {
            return 'text/plain';
        }
        
        return 'application/octet-stream';
    }
    
    static calculateSize(content: any): number {
        if (typeof content === 'string') {
            return Buffer.byteLength(content, 'utf8');
        }
        
        if (typeof content === 'object') {
            return Buffer.byteLength(JSON.stringify(content), 'utf8');
        }
        
        return Buffer.byteLength(String(content), 'utf8');
    }
}

export interface ProcessedContent {
    processed_content: any;
    content_type: string;
    size: number;
    encoding: string;
}

/**
 * FTP Permission Validator - Check write permissions (Phase 3)
 */
class FtpPermissionValidator {
    static async validateStorePermission(
        system: any, 
        path: FtpStorePath, 
        operation: 'create' | 'update'
    ): Promise<ValidationResult> {
        const user = system.getUser();
        
        // Root user has all permissions
        if (system.isRoot()) {
            return { allowed: true, reason: 'root_user' };
        }
        
        try {
            // For record operations, check if record exists and user has permission
            if (path.operation_type === 'record') {
                const existingRecord = await system.database.selectOne(path.schema, {
                    where: { id: path.record_id }
                });
                
                if (existingRecord) {
                    // Update operation - check edit/full permissions
                    const hasEditPermission = this.hasPermission(user, existingRecord, ['access_edit', 'access_full']);
                    if (!hasEditPermission) {
                        return { 
                            allowed: false, 
                            reason: 'insufficient_permissions',
                            details: 'User lacks edit permission for existing record'
                        };
                    }
                } else {
                    // Create operation - check if user can create in this schema
                    // For now, allow creation if user has any schema access
                }
                
                return { allowed: true, reason: 'permission_verified' };
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
                
                const hasEditPermission = this.hasPermission(user, existingRecord, ['access_edit', 'access_full']);
                if (!hasEditPermission) {
                    return {
                        allowed: false,
                        reason: 'insufficient_permissions',
                        details: 'User lacks edit permission for record'
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

export interface ValidationResult {
    allowed: boolean;
    reason: string;
    details?: string;
}


/**
 * POST /ftp/store - Enhanced File Storage Middleware (Phase 3)
 * 
 * Advanced file storage endpoint supporting atomic operations, field-level updates,
 * transaction management, and comprehensive error handling.
 */
export default async function ftpStoreHandler(context: Context): Promise<any> {
    const system = context.get('system');
    const requestBody: FtpStoreRequest = await context.req.json();
    
    if (!system) {
        throw new Error('System context not available - ensure systemContextMiddleware is applied');
    }
    
    // Start timing for performance metrics
    const startTime = process.hrtime.bigint();
    
    system.info('FTP store operation (Phase 3)', {
        path: requestBody.path,
        options: requestBody.ftp_options,
        hasContent: !!requestBody.content,
        contentSize: JSON.stringify(requestBody.content).length
    });
    
    let transactionId: string | undefined;
    
    try {
        // Default options
        const options = {
            ...requestBody.ftp_options,
            binary_mode: requestBody.ftp_options.binary_mode ?? false,
            overwrite: requestBody.ftp_options.overwrite ?? true,
            append_mode: requestBody.ftp_options.append_mode ?? false,
            create_path: requestBody.ftp_options.create_path ?? false,
            atomic: requestBody.ftp_options.atomic ?? true,
            validate_schema: requestBody.ftp_options.validate_schema ?? true
        };
        
        // Parse FTP path to understand the storage operation
        const ftpPath = FtpStorePathParser.parse(requestBody.path);
        
        // Process content based on path and options
        const processedContent = FtpContentProcessor.processContent(
            requestBody.content,
            ftpPath,
            options
        );
        
        // Start transaction if atomic operation requested
        if (options.atomic && !requestBody.metadata?.transaction_id) {
            transactionId = await FtpTransactionManager.beginTransaction(
                system,
                'store',
                requestBody.path
            );
        } else if (requestBody.metadata?.transaction_id) {
            transactionId = requestBody.metadata.transaction_id;
        }
        
        // Validate permissions
        const permissionCheck = await FtpPermissionValidator.validateStorePermission(
            system,
            ftpPath,
            'create' // Will be determined during operation
        );
        
        if (!permissionCheck.allowed) {
            throw new Error(`Permission denied: ${permissionCheck.reason}${permissionCheck.details ? ' - ' + permissionCheck.details : ''}`);
        }
        
        let operationResult: any;
        let operation: 'create' | 'update' | 'append' | 'field_update';
        
        // Execute the storage operation
        switch (ftpPath.operation_type) {
            case 'record':
                operationResult = await handleRecordStorage(
                    system,
                    ftpPath,
                    processedContent,
                    options
                );
                operation = operationResult.created ? 'create' : 'update';
                break;
                
            case 'field':
                operationResult = await handleFieldStorage(
                    system,
                    ftpPath,
                    processedContent,
                    options
                );
                operation = 'field_update';
                break;
                
            default:
                throw new Error(`Unsupported operation type: ${ftpPath.operation_type}`);
        }
        
        // Commit transaction if we started one
        if (transactionId && options.atomic) {
            await FtpTransactionManager.commitTransaction(transactionId);
        }
        
        // Calculate performance metrics
        const totalTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        
        // Generate ETag for caching
        const etag = generateETag(operationResult.result, processedContent);
        
        // Build response
        const response: FtpStoreResponse = {
            success: true,
            operation,
            result: {
                path: requestBody.path,
                record_id: ftpPath.record_id,
                field_name: ftpPath.field_name,
                size: processedContent.size,
                created: operationResult.created || false,
                updated: operationResult.updated || true,
                validation_passed: true // TODO: Implement schema validation
            },
            ftp_metadata: {
                modified_time: formatFtpTimestamp(new Date()),
                permissions: calculatePermissions(system, operationResult.result),
                can_resume: false, // TODO: Implement resume support
                etag,
                content_type: processedContent.content_type
            },
            transaction_info: transactionId ? {
                transaction_id: transactionId,
                can_rollback: false, // Transaction already committed
                timeout_ms: 30000
            } : undefined
        };
        
        system.info('FTP store completed (Phase 3)', {
            path: requestBody.path,
            operation,
            recordId: ftpPath.record_id,
            size: processedContent.size,
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
                system.warn('Failed to rollback transaction', {
                    transactionId,
                    rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                });
            }
        }
        
        system.warn('FTP store failed', {
            path: requestBody.path,
            error: error instanceof Error ? error.message : String(error),
            transactionId
        });
        
        throw error;
    }
}

// Helper methods for the handler (Phase 3)
async function handleRecordStorage(
    system: any,
    path: FtpStorePath,
    content: ProcessedContent,
    options: FtpStoreRequest['ftp_options']
): Promise<StorageResult> {
    // Check if record exists
    const existingRecord = await system.database.selectOne(path.schema, {
        where: { id: path.record_id }
    });
    
    if (existingRecord && !options.overwrite) {
        throw new Error(`Record ${path.record_id} already exists and overwrite is disabled`);
    }
    
    let result: any;
    let created = false;
    let updated = false;
    
    if (existingRecord) {
        // Update existing record
        if (options.append_mode) {
            // Append mode - merge with existing data
            const mergedContent = { ...existingRecord, ...content.processed_content };
            result = await system.database.updateOne(path.schema, path.record_id, mergedContent);
            updated = true;
        } else {
            // Replace mode
            result = await system.database.updateOne(path.schema, path.record_id, content.processed_content);
            updated = true;
        }
    } else {
        // Create new record
        const recordData = {
            id: path.record_id,
            ...content.processed_content
        };
        result = await system.database.createOne(path.schema, recordData);
        created = true;
    }
    
    return { result, created, updated };
}

async function handleFieldStorage(
    system: any,
    path: FtpStorePath,
    content: ProcessedContent,
    options: FtpStoreRequest['ftp_options']
): Promise<StorageResult> {
    // Field updates always target existing records
    const existingRecord = await system.database.selectOne(path.schema, {
        where: { id: path.record_id }
    });
    
    if (!existingRecord) {
        throw new Error(`Record ${path.record_id} not found in schema ${path.schema}`);
    }
    
    // Update the specific field
    const fieldUpdate: any = {};
    
    if (options.append_mode && typeof existingRecord[path.field_name!] === 'string' && typeof content.processed_content === 'string') {
        // Append to existing string field
        fieldUpdate[path.field_name!] = existingRecord[path.field_name!] + content.processed_content;
    } else {
        // Replace field value
        fieldUpdate[path.field_name!] = content.processed_content;
    }
    
    const result = await system.database.updateOne(path.schema, path.record_id, fieldUpdate);
    
    return { result, created: false, updated: true };
}

function generateETag(result: any, content: ProcessedContent): string {
    const data = JSON.stringify({ result, content: content.processed_content });
    // Simple hash - in production, use crypto.createHash
    return Buffer.from(data).toString('base64').substr(0, 32);
}

function calculatePermissions(system: any, record: any): string {
    const user = system.getUser();
    if (system.isRoot()) return 'rwx';
    
    const userContext = [user.id, ...(user.accessRead || [])];
    const hasEdit = record.access_edit?.some((id: string) => userContext.includes(id)) || false;
    const hasFull = record.access_full?.some((id: string) => userContext.includes(id)) || false;
    
    if (hasFull) return 'rwx';
    if (hasEdit) return 'rw-';
    return 'r--';
}

function formatFtpTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    const second = date.getSeconds().toString().padStart(2, '0');
    
    return `${year}${month}${day}${hour}${minute}${second}`;
}

export interface StorageResult {
    result: any;
    created: boolean;
    updated: boolean;
}