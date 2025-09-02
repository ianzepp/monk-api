import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';
import type { FilePath, FilePermissionResult, FilePermissionContext, FilePermissions, AccessLevel, FileOperationType } from '@src/lib/file-api/file-types.js';

/**
 * FilePermissionValidator - Unified permission validation for File API operations
 *
 * The authoritative implementation for File API ACL validation across all operations.
 * Follows the established patterns from FilterWhere for validation and error handling.
 *
 * Features: Comprehensive ACL checking, user context validation, operation-specific
 * permission requirements, and consistent error reporting.
 *
 * Quick Examples:
 * - Read: `FilePermissionValidator.validate(system, path, { operation: 'list' })`
 * - Write: `FilePermissionValidator.validate(system, path, { operation: 'store' })`
 * - Delete: `FilePermissionValidator.validate(system, path, { operation: 'delete' })`
 */
export class FilePermissionValidator {
    /**
     * Validate user permissions for file operation
     * This is the authoritative entry point for all File permission validation
     */
    static async validate(system: any, path: FilePath, context: FilePermissionContext): Promise<FilePermissionResult> {
        try {
            // Root user has all permissions
            if (context.is_root) {
                return {
                    allowed: true,
                    reason: 'root_user',
                    permissions: 'rwx',
                    access_level: 'full',
                };
            }

            // Validate based on path type and operation
            return await FilePermissionValidator.validateByPathType(system, path, context);
        } catch (error) {
            logger.warn('FilePermissionValidator failed', {
                path: path.raw_path,
                operation: context.operation,
                user: context.user_id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Build permission context from system
     */
    static buildContext(system: any, operation: FileOperationType): FilePermissionContext {
        const user = system.getUser();
        return {
            user_id: user.id,
            user_groups: user.accessRead || [],
            is_root: system.isRoot(),
            operation,
            path: {} as FilePath, // Will be set by caller
        };
    }

    /**
     * Validate permissions based on path type
     */
    private static async validateByPathType(system: any, path: FilePath, context: FilePermissionContext): Promise<FilePermissionResult> {
        switch (path.type) {
            case 'root':
            case 'data':
            case 'meta':
                // Directory operations - generally allowed for authenticated users
                return {
                    allowed: true,
                    reason: 'directory_access',
                    permissions: 'r-x',
                    access_level: 'read',
                };

            case 'schema':
                return await FilePermissionValidator.validateSchemaPermission(system, path, context);

            case 'record':
                return await FilePermissionValidator.validateRecordPermission(system, path, context);

            case 'field':
                return await FilePermissionValidator.validateFieldPermission(system, path, context);

            default:
                throw HttpErrors.badRequest(`Unsupported path type: ${path.type}`, 'UNSUPPORTED_PATH_TYPE');
        }
    }

    /**
     * Validate schema-level permissions
     */
    private static async validateSchemaPermission(system: any, path: FilePath, context: FilePermissionContext): Promise<FilePermissionResult> {
        // Schema-level operations - allow read for authenticated users
        // Individual route handlers will validate schema existence when needed
        if (FilePermissionValidator.isReadOperation(context.operation)) {
            return {
                allowed: true,
                reason: 'schema_read_access',
                permissions: 'r-x',
                access_level: 'read',
            };
        }

        // Schema-level modifications require admin privileges and schema validation
        if (context.operation === 'delete' && !path.has_wildcards) {
            try {
                await system.database.toSchema(path.schema!);
            } catch (error) {
                throw HttpErrors.notFound(`Schema not found: ${path.schema}`, 'SCHEMA_NOT_FOUND');
            }
            
            return {
                allowed: false,
                reason: 'schema_deletion_forbidden',
                details: 'Schema deletion requires administrator privileges',
                permissions: '---',
                access_level: 'none',
            };
        }

        // Store operations - validate schema exists
        if (context.operation === 'store' && !path.has_wildcards) {
            try {
                await system.database.toSchema(path.schema!);
            } catch (error) {
                throw HttpErrors.notFound(`Schema not found: ${path.schema}`, 'SCHEMA_NOT_FOUND');
            }
        }

        // Wildcard operations at schema level
        return {
            allowed: true,
            reason: 'wildcard_schema_access',
            permissions: 'r-x',
            access_level: 'read',
        };
    }

    /**
     * Validate record-level permissions
     */
    private static async validateRecordPermission(system: any, path: FilePath, context: FilePermissionContext): Promise<FilePermissionResult> {
        // For wildcard operations, permission validation happens during expansion
        if (path.has_wildcards) {
            return {
                allowed: true,
                reason: 'wildcard_record_access',
                permissions: 'r--', // Conservative permissions for wildcards
                access_level: 'read',
            };
        }

        // Get the specific record for permission checking
        const record = await system.database.selectOne(path.schema!, {
            where: { id: path.record_id! },
        });

        if (!record) {
            throw HttpErrors.notFound(`Record not found: ${path.record_id}`, 'RECORD_NOT_FOUND');
        }

        // Calculate permissions based on ACL
        const permissionResult = FilePermissionValidator.calculateRecordPermissions(context, record);

        // Check operation-specific requirements
        if (!FilePermissionValidator.hasRequiredAccess(context.operation, permissionResult.access_level)) {
            return {
                allowed: false,
                reason: 'insufficient_permissions',
                details: `Operation ${context.operation} requires ${FilePermissionValidator.getRequiredAccess(context.operation)} access`,
                permissions: permissionResult.permissions,
                access_level: permissionResult.access_level,
            };
        }

        return {
            allowed: true,
            reason: 'record_permission_verified',
            permissions: permissionResult.permissions,
            access_level: permissionResult.access_level,
        };
    }

    /**
     * Validate field-level permissions
     */
    private static async validateFieldPermission(system: any, path: FilePath, context: FilePermissionContext): Promise<FilePermissionResult> {
        // Field operations inherit record permissions
        const recordResult = await FilePermissionValidator.validateRecordPermission(system, {
            ...path,
            type: 'record',
        }, context);

        if (!recordResult.allowed) {
            return recordResult;
        }

        // Additional field existence check for non-wildcard operations
        if (!path.has_wildcards) {
            const record = await system.database.selectOne(path.schema!, {
                where: { id: path.record_id! },
            });

            if (record && !(path.field_name! in record)) {
                throw HttpErrors.notFound(`Field not found: ${path.field_name}`, 'FIELD_NOT_FOUND');
            }
        }

        return {
            ...recordResult,
            reason: 'field_permission_verified',
        };
    }

    /**
     * Calculate record permissions based on ACL arrays
     */
    private static calculateRecordPermissions(context: FilePermissionContext, record: any): { permissions: FilePermissions; access_level: AccessLevel } {
        const userContext = [context.user_id, ...context.user_groups];

        // Check access levels
        const hasRead = record.access_read?.some((id: string) => userContext.includes(id)) || false;
        const hasEdit = record.access_edit?.some((id: string) => userContext.includes(id)) || false;
        const hasFull = record.access_full?.some((id: string) => userContext.includes(id)) || false;
        const isDenied = record.access_deny?.some((id: string) => userContext.includes(id)) || false;

        if (isDenied) {
            return { permissions: '---', access_level: 'none' };
        }

        if (hasFull) {
            return { permissions: 'rwx', access_level: 'full' };
        }

        if (hasEdit) {
            return { permissions: 'rw-', access_level: 'edit' };
        }

        if (hasRead) {
            return { permissions: 'r--', access_level: 'read' };
        }

        return { permissions: '---', access_level: 'none' };
    }

    /**
     * Check if operation is read-only
     */
    private static isReadOperation(operation: FileOperationType): boolean {
        return ['list', 'retrieve', 'stat', 'size', 'modify-time'].includes(operation);
    }

    /**
     * Get required access level for operation
     */
    private static getRequiredAccess(operation: FileOperationType): AccessLevel {
        switch (operation) {
            case 'list':
            case 'retrieve':
            case 'stat':
            case 'size':
            case 'modify-time':
                return 'read';
            
            case 'store':
                return 'edit';
                
            case 'delete':
                return 'full';
                
            default:
                return 'full';
        }
    }

    /**
     * Check if user has required access level for operation
     */
    private static hasRequiredAccess(operation: FileOperationType, userAccess: AccessLevel): boolean {
        const required = FilePermissionValidator.getRequiredAccess(operation);
        
        if (required === 'read') {
            return ['read', 'edit', 'full'].includes(userAccess);
        }
        
        if (required === 'edit') {
            return ['edit', 'full'].includes(userAccess);
        }
        
        if (required === 'full') {
            return userAccess === 'full';
        }
        
        return false;
    }

    /**
     * Calculate directory permissions based on schema access
     */
    static calculateDirectoryPermissions(context: FilePermissionContext): FilePermissions {
        if (context.is_root) {
            return 'rwx';
        }

        // Conservative permissions for directories
        return 'r-x';
    }
}