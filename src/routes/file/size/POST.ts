import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

// File Size Transport Types
export interface FileSizeRequest {
    path: string; // "/data/accounts/123.json" or "/data/accounts/123/email"
}

export interface FileSizeResponse {
    success: true;
    size: number; // Exact byte size
    path: string;
    content_info: {
        type: 'file'; // Always "file" for successful SIZE
        encoding: 'utf8';
        estimated: boolean; // True if size calculation is approximate
    };
}

export interface FileSizeErrorResponse {
    success: false;
    error: 'not_a_file' | 'file_not_found' | 'permission_denied' | 'invalid_path';
    message: string;
    path: string;
    file_code: number;
}

/**
 * File Size Calculator - Calculate exact byte sizes for File SIZE command
 */
class FileSizeCalculator {
    /**
     * Calculate exact byte size of content
     */
    static calculateSize(content: any): number {
        if (typeof content === 'string') {
            return Buffer.byteLength(content, 'utf8');
        }

        if (typeof content === 'object' && content !== null) {
            return Buffer.byteLength(JSON.stringify(content), 'utf8');
        }

        return Buffer.byteLength(String(content), 'utf8');
    }

    /**
     * Calculate size of JSON record
     */
    static calculateRecordSize(record: any): number {
        return Buffer.byteLength(JSON.stringify(record), 'utf8');
    }

    /**
     * Calculate size of individual field
     */
    static calculateFieldSize(fieldValue: any): number {
        if (fieldValue === null || fieldValue === undefined) {
            return 0;
        }

        if (typeof fieldValue === 'string') {
            return Buffer.byteLength(fieldValue, 'utf8');
        }

        if (typeof fieldValue === 'object') {
            return Buffer.byteLength(JSON.stringify(fieldValue), 'utf8');
        }

        return Buffer.byteLength(String(fieldValue), 'utf8');
    }
}

/**
 * File Size Path Parser - Parse paths for SIZE command validation
 */
class FileSizePathParser {
    static parse(path: string): FileSizePath {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);

        if (parts.length === 0) {
            throw new FileSizeError('not_a_file', 'SIZE command only works on files, not directories', path, 550);
        }

        // /data or /meta paths only
        if (parts[0] !== 'data' && parts[0] !== 'meta') {
            throw new FileSizeError('invalid_path', 'SIZE command only supports /data and /meta paths', path, 550);
        }

        const apiType = parts[0] as 'data' | 'meta';

        // /data or /meta (directories)
        if (parts.length === 1) {
            throw new FileSizeError('not_a_file', 'SIZE command only works on files, not directories', path, 550);
        }

        // /data/schema (directories)
        if (parts.length === 2) {
            throw new FileSizeError('not_a_file', 'SIZE command only works on files, not directories', path, 550);
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

            if (!isJsonFile) {
                throw new FileSizeError('not_a_file', 'SIZE command only works on files, not directories', path, 550);
            }

            return {
                api_type: apiType,
                operation_type: 'record',
                schema: schemaName,
                record_id: recordId,
                is_json_file: true,
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
                field_name: fieldName,
            };
        }

        throw new FileSizeError('invalid_path', `Invalid File size path format: ${path} - too many path components`, path, 550);
    }

    static validate(path: string): boolean {
        try {
            this.parse(path);
            return true;
        } catch (error) {
            return false;
        }
    }
}

export interface FileSizePath {
    api_type: 'data' | 'meta';
    operation_type: 'record' | 'field';
    schema: string;
    record_id: string;
    field_name?: string;
    is_json_file?: boolean;
}

/**
 * File Size Error - Specialized error for SIZE command failures
 */
class FileSizeError extends Error {
    constructor(
        public readonly errorType: string,
        message: string,
        public readonly path: string,
        public readonly fileCode: number
    ) {
        super(message);
        this.name = 'FileSizeError';
    }
}

/**
 * File Size Permission Validator - Check file access permissions
 */
class FileSizePermissionValidator {
    static async validateSizePermission(system: any, path: FileSizePath): Promise<boolean> {
        const user = system.getUser();

        // Root user has all permissions
        if (system.isRoot()) {
            return true;
        }

        try {
            // For all operations, check if record exists and user has access
            const record = await system.database.selectOne(path.schema, {
                where: { id: path.record_id },
            });

            if (!record) {
                throw new FileSizeError('file_not_found', `File does not exist: ${path.record_id}`, '', 550);
            }

            // Check user permissions for reading
            const userContext = [user.id, ...(user.accessRead || [])];
            const hasReadAccess =
                record.access_read?.some((id: string) => userContext.includes(id)) ||
                record.access_edit?.some((id: string) => userContext.includes(id)) ||
                record.access_full?.some((id: string) => userContext.includes(id));

            // Check for explicit denial
            const isDenied = record.access_deny?.some((id: string) => userContext.includes(id));

            return hasReadAccess && !isDenied;
        } catch (error) {
            if (error instanceof FileSizeError) {
                throw error;
            }

            throw new FileSizeError('permission_denied', 'Permission check failed', '', 550);
        }
    }
}

/**
 * POST /api/file/size - File Size Query Middleware
 *
 * Lightweight endpoint for File SIZE command support.
 * Returns exact byte sizes for files without full metadata overhead.
 * Supports both complete record JSON files and individual field files.
 */
export default withParams(async (context, { system, body }) => {
    const requestBody: FileSizeRequest = body;

    logger.info('File size operation', {
        path: requestBody.path,
    });

    try {
        // Parse and validate File path for SIZE operation
        const filePath = FileSizePathParser.parse(requestBody.path);

        // Validate permissions
        const hasPermission = await FileSizePermissionValidator.validateSizePermission(system, filePath);

        if (!hasPermission) {
            const errorResponse: FileSizeErrorResponse = {
                success: false,
                error: 'permission_denied',
                message: 'Access denied',
                path: requestBody.path,
                file_code: 550,
            };

            logger.warn('File size permission denied', {
                path: requestBody.path,
                user: system.getUser().id,
            });

            setRouteResult(context, errorResponse);
            return;
        }

        let fileSize: number;

        // Execute the size calculation based on path type
        switch (filePath.operation_type) {
            case 'record':
                // Complete JSON record size
                const record = await system.database.selectOne(filePath.schema, {
                    where: { id: filePath.record_id },
                });

                if (!record) {
                    throw new FileSizeError('file_not_found', `Record not found: ${filePath.record_id}`, requestBody.path, 550);
                }

                fileSize = FileSizeCalculator.calculateRecordSize(record);
                break;

            case 'field':
                // Individual field size
                const fieldRecord = await system.database.selectOne(filePath.schema, {
                    where: { id: filePath.record_id },
                });

                if (!fieldRecord) {
                    throw new FileSizeError('file_not_found', `Record not found: ${filePath.record_id}`, requestBody.path, 550);
                }

                if (!(filePath.field_name! in fieldRecord)) {
                    throw new FileSizeError('file_not_found', `Field not found: ${filePath.field_name}`, requestBody.path, 550);
                }

                const fieldValue = fieldRecord[filePath.field_name!];
                fileSize = FileSizeCalculator.calculateFieldSize(fieldValue);
                break;

            default:
                throw new FileSizeError('invalid_path', `Unsupported operation type: ${filePath.operation_type}`, requestBody.path, 550);
        }

        // Build successful response
        const response: FileSizeResponse = {
            success: true,
            size: fileSize,
            path: requestBody.path,
            content_info: {
                type: 'file',
                encoding: 'utf8',
                estimated: false,
            },
        };

        logger.info('File size completed', {
            path: requestBody.path,
            size: fileSize,
            operationType: filePath.operation_type,
        });

        setRouteResult(context, response);
    } catch (error) {
        if (error instanceof FileSizeError) {
            const errorResponse: FileSizeErrorResponse = {
                success: false,
                error: error.errorType as any,
                message: error.message,
                path: requestBody.path,
                file_code: error.fileCode,
            };

            logger.warn('File size failed', {
                path: requestBody.path,
                error: error.errorType,
                message: error.message,
            });

            setRouteResult(context, errorResponse);
        } else {
            logger.warn('File size unexpected error', {
                path: requestBody.path,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    }
});
