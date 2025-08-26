import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

// FTP Modify Time Transport Types
export interface FtpModifyTimeRequest {
    path: string;                   // "/data/account/123.json" or "/data/account/123/email" or "/data/account/"
}

export interface FtpModifyTimeResponse {
    success: true;
    modified_time: string;          // FTP format: YYYYMMDDHHMMSS
    path: string;
    timestamp_info: {
        source: 'updated_at' | 'created_at' | 'current_time';
        iso_timestamp: string;      // ISO 8601 format
        timezone: 'UTC';
    };
}

export interface FtpModifyTimeErrorResponse {
    success: false;
    error: 'file_not_found' | 'permission_denied' | 'invalid_path';
    message: string;
    path: string;
    ftp_code: number;
}

/**
 * FTP Timestamp Formatter - Convert dates to FTP MDTM format
 */
class FtpTimestampFormatter {
    /**
     * Format date to FTP timestamp: YYYYMMDDHHMMSS
     */
    static formatFtpTimestamp(date: Date | string): string {
        const d = new Date(date);
        const year = d.getUTCFullYear();
        const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = d.getUTCDate().toString().padStart(2, '0');
        const hour = d.getUTCHours().toString().padStart(2, '0');
        const minute = d.getUTCMinutes().toString().padStart(2, '0');
        const second = d.getUTCSeconds().toString().padStart(2, '0');
        
        return `${year}${month}${day}${hour}${minute}${second}`;
    }
    
    /**
     * Get best available timestamp from record
     */
    static getBestTimestamp(record: any): { timestamp: Date, source: 'updated_at' | 'created_at' } {
        if (record.updated_at) {
            return {
                timestamp: new Date(record.updated_at),
                source: 'updated_at'
            };
        }
        
        if (record.created_at) {
            return {
                timestamp: new Date(record.created_at),
                source: 'created_at'
            };
        }
        
        // Fallback to current time (shouldn't happen with proper records)
        return {
            timestamp: new Date(),
            source: 'updated_at'
        };
    }
}

/**
 * FTP Modify Time Path Parser - Parse paths for MDTM command
 */
class FtpModifyTimePathParser {
    static parse(path: string): FtpModifyTimePath {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);
        
        if (parts.length === 0) {
            return {
                api_type: 'root',
                operation_type: 'root'
            };
        }
        
        // /data or /meta paths only
        if (parts[0] !== 'data' && parts[0] !== 'meta') {
            throw new FtpModifyTimeError('invalid_path', 'MDTM command only supports /data and /meta paths', path, 550);
        }
        
        const apiType = parts[0] as 'data' | 'meta';
        
        // /data or /meta (directories)
        if (parts.length === 1) {
            return {
                api_type: apiType,
                operation_type: 'directory',
                directory_type: 'api_root'
            };
        }
        
        // /data/schema (directories)
        if (parts.length === 2) {
            return {
                api_type: apiType,
                operation_type: 'directory',
                directory_type: 'schema',
                schema: parts[1]
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
            
            if (isJsonFile) {
                return {
                    api_type: apiType,
                    operation_type: 'record_file',
                    schema: schemaName,
                    record_id: recordId
                };
            } 
            
            else {
                return {
                    api_type: apiType,
                    operation_type: 'directory',
                    directory_type: 'record',
                    schema: schemaName,
                    record_id: recordId
                };
            }
        }
        
        // /data/schema/record-id/field
        if (parts.length === 4) {
            const schemaName = parts[1];
            const recordId = parts[2];
            const fieldName = parts[3];
            
            return {
                api_type: apiType,
                operation_type: 'field_file',
                schema: schemaName,
                record_id: recordId,
                field_name: fieldName
            };
        }
        
        throw new FtpModifyTimeError('invalid_path', `Invalid FTP modify time path format: ${path} - too many path components`, path, 550);
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

export interface FtpModifyTimePath {
    api_type: 'root' | 'data' | 'meta';
    operation_type: 'root' | 'directory' | 'record_file' | 'field_file';
    directory_type?: 'api_root' | 'schema' | 'record';
    schema?: string;
    record_id?: string;
    field_name?: string;
}

/**
 * FTP Modify Time Error - Specialized error for MDTM command failures
 */
class FtpModifyTimeError extends Error {
    constructor(
        public readonly errorType: string,
        message: string,
        public readonly path: string,
        public readonly ftpCode: number
    ) {
        super(message);
        this.name = 'FtpModifyTimeError';
    }
}

/**
 * FTP Modify Time Permission Validator - Check file/directory access permissions
 */
class FtpModifyTimePermissionValidator {
    static async validateModifyTimePermission(
        system: any,
        path: FtpModifyTimePath
    ): Promise<boolean> {
        const user = system.getUser();
        
        // Root user has all permissions
        if (system.isRoot()) {
            return true;
        }
        
        try {
            // For record and field operations, check if record exists and user has access
            if (path.operation_type === 'record_file' || path.operation_type === 'field_file') {
                const record = await system.database.selectOne(path.schema!, {
                    where: { id: path.record_id! }
                });
                
                if (!record) {
                    throw new FtpModifyTimeError('file_not_found', `File does not exist: ${path.record_id}`, '', 550);
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
            }
            
            // For directories and root, generally allow access
            return true;
            
        } catch (error) {
            if (error instanceof FtpModifyTimeError) {
                throw error;
            }
            
            throw new FtpModifyTimeError('permission_denied', 'Permission check failed', '', 550);
        }
    }
}

/**
 * FTP Modify Time Operations - Handle different path types
 */
class FtpModifyTimeOperations {
    static async getModificationTime(system: any, path: FtpModifyTimePath): Promise<{
        timestamp: Date,
        source: 'updated_at' | 'created_at' | 'current_time'
    }> {
        switch (path.operation_type) {
            case 'root':
                // Root directory - use current server time
                return {
                    timestamp: new Date(),
                    source: 'current_time'
                };
                
            case 'directory':
                return await this.getDirectoryModificationTime(system, path);
                
            case 'record_file':
                return await this.getRecordFileModificationTime(system, path);
                
            case 'field_file':
                return await this.getFieldFileModificationTime(system, path);
                
            default:
                throw new FtpModifyTimeError('invalid_path', `Unsupported operation type: ${path.operation_type}`, '', 550);
        }
    }
    
    static async getDirectoryModificationTime(system: any, path: FtpModifyTimePath): Promise<{
        timestamp: Date,
        source: 'updated_at' | 'created_at' | 'current_time'
    }> {
        switch (path.directory_type) {
            case 'api_root':
                // /data or /meta directory - use current time
                return {
                    timestamp: new Date(),
                    source: 'current_time'
                };
                
            case 'schema':
                // /data/schema directory - get most recent record or schema creation time
                try {
                    const recentRecord = await system.database.selectAny(path.schema!, {
                        order: 'updated_at desc',
                        limit: 1
                    });
                    
                    if (recentRecord.length > 0) {
                        const { timestamp, source } = FtpTimestampFormatter.getBestTimestamp(recentRecord[0]);
                        return { timestamp, source };
                    }
                    
                    // No records, use current time
                    return {
                        timestamp: new Date(),
                        source: 'current_time'
                    };
                } catch {
                    // Schema might not exist or no access
                    return {
                        timestamp: new Date(),
                        source: 'current_time'
                    };
                }
                
            case 'record':
                // /data/schema/record directory - use record timestamp
                const record = await system.database.selectOne(path.schema!, {
                    where: { id: path.record_id! }
                });
                
                if (!record) {
                    throw new FtpModifyTimeError('file_not_found', `Record not found: ${path.record_id}`, '', 550);
                }
                
                const { timestamp, source } = FtpTimestampFormatter.getBestTimestamp(record);
                return { timestamp, source };
                
            default:
                return {
                    timestamp: new Date(),
                    source: 'current_time'
                };
        }
    }
    
    static async getRecordFileModificationTime(system: any, path: FtpModifyTimePath): Promise<{
        timestamp: Date,
        source: 'updated_at' | 'created_at' | 'current_time'
    }> {
        const record = await system.database.selectOne(path.schema!, {
            where: { id: path.record_id! }
        });
        
        if (!record) {
            throw new FtpModifyTimeError('file_not_found', `Record not found: ${path.record_id}`, '', 550);
        }
        
        const { timestamp, source } = FtpTimestampFormatter.getBestTimestamp(record);
        return { timestamp, source };
    }
    
    static async getFieldFileModificationTime(system: any, path: FtpModifyTimePath): Promise<{
        timestamp: Date,
        source: 'updated_at' | 'created_at' | 'current_time'
    }> {
        const record = await system.database.selectOne(path.schema!, {
            where: { id: path.record_id! }
        });
        
        if (!record) {
            throw new FtpModifyTimeError('file_not_found', `Record not found: ${path.record_id}`, '', 550);
        }
        
        if (!(path.field_name! in record)) {
            throw new FtpModifyTimeError('file_not_found', `Field not found: ${path.field_name}`, '', 550);
        }
        
        // Field inherits parent record's timestamp
        const { timestamp, source } = FtpTimestampFormatter.getBestTimestamp(record);
        return { timestamp, source };
    }
}

/**
 * POST /ftp/modify-time - Modification Time Query Middleware
 * 
 * Lightweight endpoint for FTP MDTM command support.
 * Returns modification timestamps in FTP format (YYYYMMDDHHMMSS) 
 * for files, directories, and fields.
 */
export default withParams(async (context, { system, body }) => {
    const requestBody: FtpModifyTimeRequest = body;
    
    logger.info('FTP modify time operation', { 
        path: requestBody.path
    });
    
    try {
        // Parse and validate FTP path for MDTM operation
        const ftpPath = FtpModifyTimePathParser.parse(requestBody.path);
        
        // Validate permissions
        const hasPermission = await FtpModifyTimePermissionValidator.validateModifyTimePermission(
            system,
            ftpPath
        );
        
        if (!hasPermission) {
            const errorResponse: FtpModifyTimeErrorResponse = {
                success: false,
                error: 'permission_denied',
                message: 'Access denied',
                path: requestBody.path,
                ftp_code: 550
            };
            
            logger.warn('FTP modify time permission denied', {
                path: requestBody.path,
                user: system.getUser().id
            });
            
            setRouteResult(context, errorResponse);
            return;
        }
        
        // Get modification time based on path type
        const { timestamp, source } = await FtpModifyTimeOperations.getModificationTime(
            system,
            ftpPath
        );
        
        // Build successful response
        const response: FtpModifyTimeResponse = {
            success: true,
            modified_time: FtpTimestampFormatter.formatFtpTimestamp(timestamp),
            path: requestBody.path,
            timestamp_info: {
                source: source,
                iso_timestamp: timestamp.toISOString(),
                timezone: 'UTC'
            }
        };
        
        logger.info('FTP modify time completed', {
            path: requestBody.path,
            modifiedTime: response.modified_time,
            source: source,
            operationType: ftpPath.operation_type
        });
        
        setRouteResult(context, response);
        
    } catch (error) {
        if (error instanceof FtpModifyTimeError) {
            const errorResponse: FtpModifyTimeErrorResponse = {
                success: false,
                error: error.errorType as any,
                message: error.message,
                path: requestBody.path,
                ftp_code: error.ftpCode
            };
            
            logger.warn('FTP modify time failed', {
                path: requestBody.path,
                error: error.errorType,
                message: error.message
            });
            
            setRouteResult(context, errorResponse);
        } 
        
        else {
            logger.warn('FTP modify time unexpected error', {
                path: requestBody.path,
                error: error instanceof Error ? error.message : String(error)
            });
            
            throw error;
        }
    }
});