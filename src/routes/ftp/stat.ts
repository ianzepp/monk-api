import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

// FTP Stat Transport Types
export interface FtpStatRequest {
    path: string;                   // "/data/account/123/" or "/data/account/123.json"
}

export interface FtpStatResponse {
    success: true;
    path: string;
    type: 'directory' | 'file' | 'link';
    permissions: string;            // FTP permissions format
    size: number;
    modified_time: string;          // FTP timestamp format
    created_time: string;           // FTP timestamp format
    access_time: string;            // FTP timestamp format
    record_info: {
        schema: string;
        record_id?: string;
        field_name?: string;
        field_count?: number;
        soft_deleted: boolean;
        access_permissions: string[]; // User's access levels
    };
    children_count?: number;        // For directories
    total_size?: number;           // Recursive size calculation
}

/**
 * FTP Status Calculator - Generate detailed status information
 */
class FtpStatusCalculator {
    static formatFtpTimestamp(date: Date | string): string {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const hour = d.getHours().toString().padStart(2, '0');
        const minute = d.getMinutes().toString().padStart(2, '0');
        const second = d.getSeconds().toString().padStart(2, '0');
        
        return `${year}${month}${day}${hour}${minute}${second}`;
    }
    
    static calculatePermissions(system: any, record?: any): string {
        if (!record) {
            return 'r-x'; // Directory permissions
        }
        
        const user = system.getUser();
        const userContext = [user.id, ...user.accessRead];
        
        // Check access levels
        const hasRead = record.access_read?.some((id: string) => userContext.includes(id)) || false;
        const hasEdit = record.access_edit?.some((id: string) => userContext.includes(id)) || false;
        const hasFull = record.access_full?.some((id: string) => userContext.includes(id)) || false;
        const isDenied = record.access_deny?.some((id: string) => userContext.includes(id)) || false;
        
        if (isDenied) {
            return '---';
        }
        
        if (hasFull) {
            return 'rwx';
        }
        
        if (hasEdit) {
            return 'rw-';
        }
        
        if (hasRead) {
            return 'r--';
        }
        
        return '---';
    }
    
    static getAccessPermissions(system: any, record?: any): string[] {
        if (!record) {
            return ['read'];
        }
        
        const user = system.getUser();
        const userContext = [user.id, ...user.accessRead];
        const permissions: string[] = [];
        
        if (record.access_read?.some((id: string) => userContext.includes(id))) {
            permissions.push('read');
        }
        
        if (record.access_edit?.some((id: string) => userContext.includes(id))) {
            permissions.push('edit');
        }
        
        if (record.access_full?.some((id: string) => userContext.includes(id))) {
            permissions.push('full');
        }
        
        return permissions.length > 0 ? permissions : ['none'];
    }
    
    static calculateContentSize(content: any): number {
        if (typeof content === 'string') {
            return Buffer.byteLength(content, 'utf8');
        }
        
        return Buffer.byteLength(JSON.stringify(content), 'utf8');
    }
}

/**
 * POST /ftp/stat - Status Information Middleware
 * 
 * Provides detailed file/directory status for FTP STAT command.
 * Returns comprehensive metadata for monk-ftp operations.
 */
export default async function ftpStatHandler(context: Context): Promise<any> {
    const system = context.get('system');
    const requestBody: FtpStatRequest = await context.req.json();
    
    logger.info('FTP stat operation', { path: requestBody.path });
    
    try {
        const cleanPath = requestBody.path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);
        
        let response: FtpStatResponse;
        
        if (parts.length === 0) {
            // Root directory
            response = {
                success: true,
                path: '/',
                type: 'directory',
                permissions: 'r-x',
                size: 0,
                modified_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                created_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                access_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                record_info: {
                    schema: '',
                    soft_deleted: false,
                    access_permissions: ['read']
                },
                children_count: 2, // /data and /meta
                total_size: 0
            };
            
        } else if (parts.length === 1 && (parts[0] === 'data' || parts[0] === 'meta')) {
            // /data or /meta directory
            const schemas = await system.database.listSchemas();
            
            response = {
                success: true,
                path: `/${parts[0]}/`,
                type: 'directory',
                permissions: 'r-x',
                size: 0,
                modified_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                created_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                access_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                record_info: {
                    schema: '',
                    soft_deleted: false,
                    access_permissions: ['read']
                },
                children_count: schemas.length,
                total_size: 0
            };
            
        } else if (parts.length === 2 && parts[0] === 'data') {
            // /data/schema directory
            const schema = parts[1];
            const recordCount = await system.database.count(schema);
            
            response = {
                success: true,
                path: `/data/${schema}/`,
                type: 'directory',
                permissions: 'rwx',
                size: 0,
                modified_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                created_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                access_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                record_info: {
                    schema,
                    soft_deleted: false,
                    access_permissions: ['read', 'edit'] // TODO: Calculate from user ACL
                },
                children_count: recordCount,
                total_size: 0
            };
            
        } else if (parts.length === 3 && parts[0] === 'data') {
            // /data/schema/record-id or /data/schema/record.json
            const schema = parts[1];
            let recordId = parts[2];
            let isJsonFile = false;
            
            if (recordId.endsWith('.json')) {
                recordId = recordId.replace('.json', '');
                isJsonFile = true;
            }
            
            const record = await system.database.selectOne(schema, {
                where: { id: recordId }
            });
            
            if (!record) {
                throw new Error(`Record not found: ${recordId}`);
            }
            
            const permissions = FtpStatusCalculator.calculatePermissions(system, record);
            const accessPermissions = FtpStatusCalculator.getAccessPermissions(system, record);
            
            if (isJsonFile) {
                // JSON file status
                const contentSize = FtpStatusCalculator.calculateContentSize(record);
                
                response = {
                    success: true,
                    path: `/data/${schema}/${recordId}.json`,
                    type: 'file',
                    permissions,
                    size: contentSize,
                    modified_time: FtpStatusCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                    created_time: FtpStatusCalculator.formatFtpTimestamp(record.created_at),
                    access_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                    record_info: {
                        schema,
                        record_id: recordId,
                        field_count: Object.keys(record).length,
                        soft_deleted: !!record.trashed_at,
                        access_permissions: accessPermissions
                    }
                };
            } else {
                // Record directory status
                const fieldCount = Object.keys(record).filter(key => 
                    !['id', 'created_at', 'updated_at', 'trashed_at', 'deleted_at'].includes(key)
                ).length;
                
                response = {
                    success: true,
                    path: `/data/${schema}/${recordId}/`,
                    type: 'directory',
                    permissions,
                    size: 0,
                    modified_time: FtpStatusCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                    created_time: FtpStatusCalculator.formatFtpTimestamp(record.created_at),
                    access_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                    record_info: {
                        schema,
                        record_id: recordId,
                        field_count: fieldCount + 1, // +1 for .json file
                        soft_deleted: !!record.trashed_at,
                        access_permissions: accessPermissions
                    },
                    children_count: fieldCount + 1
                };
            }
            
        } else if (parts.length === 4 && parts[0] === 'data') {
            // /data/schema/record-id/field
            const schema = parts[1];
            const recordId = parts[2];
            const fieldName = parts[3];
            
            const record = await system.database.selectOne(schema, {
                where: { id: recordId }
            });
            
            if (!record) {
                throw new Error(`Record not found: ${recordId}`);
            }
            
            if (!(fieldName in record)) {
                throw new Error(`Field not found: ${fieldName}`);
            }
            
            const permissions = FtpStatusCalculator.calculatePermissions(system, record);
            const accessPermissions = FtpStatusCalculator.getAccessPermissions(system, record);
            const fieldContent = record[fieldName];
            const contentSize = FtpStatusCalculator.calculateContentSize(fieldContent);
            
            response = {
                success: true,
                path: `/data/${schema}/${recordId}/${fieldName}`,
                type: 'file',
                permissions,
                size: contentSize,
                modified_time: FtpStatusCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                created_time: FtpStatusCalculator.formatFtpTimestamp(record.created_at),
                access_time: FtpStatusCalculator.formatFtpTimestamp(new Date()),
                record_info: {
                    schema,
                    record_id: recordId,
                    field_name: fieldName,
                    soft_deleted: !!record.trashed_at,
                    access_permissions: accessPermissions
                }
            };
            
        } else {
            throw new Error(`Unsupported path format for stat: ${requestBody.path}`);
        }
        
        logger.info('FTP stat completed', {
            path: requestBody.path,
            type: response.type,
            size: response.size,
            permissions: response.permissions
        });
        
        setRouteResult(context, response);
        
    } catch (error) {
        logger.warn('FTP stat failed', {
            path: requestBody.path,
            error: error instanceof Error ? error.message : String(error)
        });
        
        throw error;
    }
}