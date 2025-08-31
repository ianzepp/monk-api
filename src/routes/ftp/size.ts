import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

// FTP Size Transport Types
export interface FtpSizeRequest {
    path: string; // "/data/accounts/123.json" or "/data/accounts/123/email"
}

export interface FtpSizeResponse {
    success: true;
    size: number; // Exact byte size
    path: string;
    content_info: {
        type: 'file'; // Always "file" for successful SIZE
        encoding: 'utf8';
        estimated: boolean; // True if size calculation is approximate
    };
}

export interface FtpSizeErrorResponse {
    success: false;
    error: 'not_a_file' | 'file_not_found' | 'permission_denied' | 'invalid_path';
    message: string;
    path: string;
    ftp_code: number;
}

/**
 * FTP Size Calculator - Calculate exact byte sizes for FTP SIZE command
 */
class FtpSizeCalculator {
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
 * FTP Size Path Parser - Parse paths for SIZE command validation
 */
class FtpSizePathParser {
    static parse(path: string): FtpSizePath {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);

        if (parts.length === 0) {
            throw new FtpSizeError('not_a_file', 'SIZE command only works on files, not directories', path, 550);
        }

        // /data or /meta paths only
        if (parts[0] !== 'data' && parts[0] !== 'meta') {
            throw new FtpSizeError('invalid_path', 'SIZE command only supports /data and /meta paths', path, 550);
        }

        const apiType = parts[0] as 'data' | 'meta';

        // /data or /meta (directories)
        if (parts.length === 1) {
            throw new FtpSizeError('not_a_file', 'SIZE command only works on files, not directories', path, 550);
        }

        // /data/schema (directories)
        if (parts.length === 2) {
            throw new FtpSizeError('not_a_file', 'SIZE command only works on files, not directories', path, 550);
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
                throw new FtpSizeError('not_a_file', 'SIZE command only works on files, not directories', path, 550);
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

        throw new FtpSizeError('invalid_path', `Invalid FTP size path format: ${path} - too many path components`, path, 550);
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

export interface FtpSizePath {
    api_type: 'data' | 'meta';
    operation_type: 'record' | 'field';
    schema: string;
    record_id: string;
    field_name?: string;
    is_json_file?: boolean;
}

/**
 * FTP Size Error - Specialized error for SIZE command failures
 */
class FtpSizeError extends Error {
    constructor(
        public readonly errorType: string,
        message: string,
        public readonly path: string,
        public readonly ftpCode: number
    ) {
        super(message);
        this.name = 'FtpSizeError';
    }
}

/**
 * FTP Size Permission Validator - Check file access permissions
 */
class FtpSizePermissionValidator {
    static async validateSizePermission(system: any, path: FtpSizePath): Promise<boolean> {
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
                throw new FtpSizeError('file_not_found', `File does not exist: ${path.record_id}`, '', 550);
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
            if (error instanceof FtpSizeError) {
                throw error;
            }

            throw new FtpSizeError('permission_denied', 'Permission check failed', '', 550);
        }
    }
}

/**
 * POST /ftp/size - File Size Query Middleware
 *
 * Lightweight endpoint for FTP SIZE command support.
 * Returns exact byte sizes for files without full metadata overhead.
 * Supports both complete record JSON files and individual field files.
 */
export default withParams(async (context, { system, body }) => {
    const requestBody: FtpSizeRequest = body;

    logger.info('FTP size operation', {
        path: requestBody.path,
    });

    try {
        // Parse and validate FTP path for SIZE operation
        const ftpPath = FtpSizePathParser.parse(requestBody.path);

        // Validate permissions
        const hasPermission = await FtpSizePermissionValidator.validateSizePermission(system, ftpPath);

        if (!hasPermission) {
            const errorResponse: FtpSizeErrorResponse = {
                success: false,
                error: 'permission_denied',
                message: 'Access denied',
                path: requestBody.path,
                ftp_code: 550,
            };

            logger.warn('FTP size permission denied', {
                path: requestBody.path,
                user: system.getUser().id,
            });

            setRouteResult(context, errorResponse);
            return;
        }

        let fileSize: number;

        // Execute the size calculation based on path type
        switch (ftpPath.operation_type) {
            case 'record':
                // Complete JSON record size
                const record = await system.database.selectOne(ftpPath.schema, {
                    where: { id: ftpPath.record_id },
                });

                if (!record) {
                    throw new FtpSizeError('file_not_found', `Record not found: ${ftpPath.record_id}`, requestBody.path, 550);
                }

                fileSize = FtpSizeCalculator.calculateRecordSize(record);
                break;

            case 'field':
                // Individual field size
                const fieldRecord = await system.database.selectOne(ftpPath.schema, {
                    where: { id: ftpPath.record_id },
                });

                if (!fieldRecord) {
                    throw new FtpSizeError('file_not_found', `Record not found: ${ftpPath.record_id}`, requestBody.path, 550);
                }

                if (!(ftpPath.field_name! in fieldRecord)) {
                    throw new FtpSizeError('file_not_found', `Field not found: ${ftpPath.field_name}`, requestBody.path, 550);
                }

                const fieldValue = fieldRecord[ftpPath.field_name!];
                fileSize = FtpSizeCalculator.calculateFieldSize(fieldValue);
                break;

            default:
                throw new FtpSizeError('invalid_path', `Unsupported operation type: ${ftpPath.operation_type}`, requestBody.path, 550);
        }

        // Build successful response
        const response: FtpSizeResponse = {
            success: true,
            size: fileSize,
            path: requestBody.path,
            content_info: {
                type: 'file',
                encoding: 'utf8',
                estimated: false,
            },
        };

        logger.info('FTP size completed', {
            path: requestBody.path,
            size: fileSize,
            operationType: ftpPath.operation_type,
        });

        setRouteResult(context, response);
    } catch (error) {
        if (error instanceof FtpSizeError) {
            const errorResponse: FtpSizeErrorResponse = {
                success: false,
                error: error.errorType as any,
                message: error.message,
                path: requestBody.path,
                ftp_code: error.ftpCode,
            };

            logger.warn('FTP size failed', {
                path: requestBody.path,
                error: error.errorType,
                message: error.message,
            });

            setRouteResult(context, errorResponse);
        } else {
            logger.warn('FTP size unexpected error', {
                path: requestBody.path,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    }
});
