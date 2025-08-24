import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

// FTP List Transport Types
export interface FtpListRequest {
    path: string;                    // FTP path: "/data/users/"
    ftp_options: {
        show_hidden: boolean;        // Include trashed records
        long_format: boolean;        // Detailed file info
        recursive: boolean;          // Recursive listing
        max_depth?: number;          // Maximum recursion depth
        sort_by?: 'name' | 'date' | 'size';
        sort_order?: 'asc' | 'desc';
    };
}

export interface FtpListResponse {
    success: true;
    entries: FtpEntry[];
    total: number;
    has_more: boolean;
}

export interface FtpEntry {
    name: string;                    // Entry name for FTP display
    ftp_type: 'd' | 'f' | 'l';      // Directory, File, Link
    ftp_size: number;               // Size for FTP SIZE command
    ftp_permissions: string;        // User permissions: "rwx", "r--", etc
    ftp_modified: string;           // FTP timestamp: "20240115103000"
    path: string;                   // Full FTP path
    api_context: {                  // Context for subsequent operations
        schema: string;
        record_id?: string;
        field_name?: string;
        access_level: 'read' | 'edit' | 'full';
    };
}

export interface FtpPath {
    type: 'root' | 'data' | 'meta' | 'schema' | 'record' | 'field';
    schema?: string;
    record_id?: string;
    field_name?: string;
    wildcards: string[];            // Wildcard components
}

/**
 * FTP Path Parser - Convert FTP filesystem paths to API context
 */
class FtpPathParser {
    static parse(path: string): FtpPath {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);
        
        if (parts.length === 0) {
            return { type: 'root', wildcards: [] };
        }
        
        // /data or /meta
        if (parts[0] === 'data' || parts[0] === 'meta') {
            if (parts.length === 1) {
                return { type: parts[0] as 'data' | 'meta', wildcards: [] };
            }
            
            // /data/schema or /meta/schema
            if (parts.length === 2) {
                return {
                    type: 'schema',
                    schema: parts[1],
                    wildcards: this.extractWildcards(parts)
                };
            }
            
            // /data/schema/record-id
            if (parts.length === 3) {
                return {
                    type: 'record',
                    schema: parts[1],
                    record_id: parts[2],
                    wildcards: this.extractWildcards(parts)
                };
            }
            
            // /data/schema/record-id/field
            if (parts.length === 4) {
                return {
                    type: 'field',
                    schema: parts[1],
                    record_id: parts[2],
                    field_name: parts[3],
                    wildcards: this.extractWildcards(parts)
                };
            }
        }
        
        throw new Error(`Invalid FTP path format: ${path}`);
    }
    
    static validate(path: string): boolean {
        try {
            this.parse(path);
            return true;
        } catch {
            return false;
        }
    }
    
    static normalize(path: string): string {
        return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }
    
    private static extractWildcards(parts: string[]): string[] {
        return parts.filter(part => part.includes('*') || part.includes('?'));
    }
}

/**
 * FTP Permission Calculator - Convert user ACL to FTP permissions
 */
class FtpPermissionCalculator {
    static calculatePermissions(userContext: any, recordAccess: any): string {
        const user = userContext.getUser();
        const userId = user.id;
        const userGroups = user.accessRead || [];
        const userContext_array = [userId, ...userGroups];
        
        // Check if user has access through any context
        const hasRead = recordAccess.access_read?.some((id: string) => userContext_array.includes(id)) || false;
        const hasEdit = recordAccess.access_edit?.some((id: string) => userContext_array.includes(id)) || false;
        const hasFull = recordAccess.access_full?.some((id: string) => userContext_array.includes(id)) || false;
        
        // Check for explicit denial
        const isDenied = recordAccess.access_deny?.some((id: string) => userContext_array.includes(id)) || false;
        
        if (isDenied) {
            return '---'; // No access
        }
        
        if (hasFull) {
            return 'rwx'; // Full access
        }
        
        if (hasEdit) {
            return 'rw-'; // Read + write
        }
        
        if (hasRead) {
            return 'r--'; // Read only
        }
        
        return '---'; // No access
    }
    
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
}

/**
 * POST /ftp/list - Directory Listing Middleware
 * 
 * Optimized directory listing endpoint that replaces multiple API calls
 * with single middleware call for monk-ftp integration.
 */
export default async function ftpListHandler(context: Context): Promise<any> {
    const system = context.get('system');
    const requestBody: FtpListRequest = await context.req.json();
    
    if (!system) {
        throw new Error('System context not available - ensure systemContextMiddleware is applied');
    }
    
    system.info('FTP list operation', { 
        path: requestBody.path,
        options: requestBody.ftp_options 
    });
    
    try {
        // Parse FTP path to understand what's being requested
        const ftpPath = FtpPathParser.parse(requestBody.path);
        const entries: FtpEntry[] = [];
        
        switch (ftpPath.type) {
            case 'root':
                // List root directories: /data, /meta
                entries.push(
                    {
                        name: 'data',
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'r-x',
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(new Date()),
                        path: '/data/',
                        api_context: {
                            schema: '',
                            access_level: 'read'
                        }
                    },
                    {
                        name: 'meta',
                        ftp_type: 'd', 
                        ftp_size: 0,
                        ftp_permissions: 'r-x',
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(new Date()),
                        path: '/meta/',
                        api_context: {
                            schema: '',
                            access_level: 'read'
                        }
                    }
                );
                break;
                
            case 'data':
                // List available schemas
                const schemas = await system.database.listSchemas();
                
                for (const schemaRecord of schemas) {
                    // Skip system schemas unless user is root
                    if (schemaRecord.name === 'schema' && !system.isRoot()) {
                        continue;
                    }
                    
                    entries.push({
                        name: schemaRecord.name,
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'rwx', // TODO: Calculate from ACL
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(schemaRecord.updated_at || schemaRecord.created_at),
                        path: `/data/${schemaRecord.name}/`,
                        api_context: {
                            schema: schemaRecord.name,
                            access_level: 'read' // TODO: Calculate from user permissions
                        }
                    });
                }
                break;
                
            case 'schema':
                // List records in schema
                if (!ftpPath.schema) {
                    throw new Error('Schema name required');
                }
                
                // Build filter for records (with ACL filtering)
                const filterData: any = {};
                
                // Handle wildcards in path if present
                if (ftpPath.wildcards.length > 0) {
                    // Convert wildcards to Filter operators using enhanced system
                    const wildcardConditions = ftpPath.wildcards.map(wildcard => {
                        // Convert shell wildcards to SQL LIKE patterns
                        const sqlPattern = wildcard.replace(/\*/g, '%').replace(/\?/g, '_');
                        return { id: { $like: sqlPattern } };
                    });
                    
                    if (wildcardConditions.length === 1) {
                        filterData.where = wildcardConditions[0];
                    } else {
                        filterData.where = { $and: wildcardConditions };
                    }
                }
                
                // Add ACL filtering for user context
                const user = system.getUser();
                if (!system.isRoot()) {
                    const userContext = [user.id, ...user.accessRead];
                    const aclFilter = {
                        $or: [
                            { access_read: { $any: userContext } },
                            { access_edit: { $any: userContext } },
                            { access_full: { $any: userContext } }
                        ]
                    };
                    
                    if (filterData.where) {
                        filterData.where = { $and: [filterData.where, aclFilter] };
                    } else {
                        filterData.where = aclFilter;
                    }
                }
                
                // Add sorting
                filterData.order = requestBody.ftp_options.sort_by === 'date' 
                    ? `updated_at ${requestBody.ftp_options.sort_order || 'desc'}`
                    : `id ${requestBody.ftp_options.sort_order || 'asc'}`;
                
                const records = await system.database.selectAny(ftpPath.schema, filterData);
                
                for (const record of records) {
                    const permissions = FtpPermissionCalculator.calculatePermissions(system, record);
                    
                    entries.push({
                        name: record.id,
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: permissions,
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                        path: `/data/${ftpPath.schema}/${record.id}/`,
                        api_context: {
                            schema: ftpPath.schema,
                            record_id: record.id,
                            access_level: permissions.includes('w') ? 'edit' : 'read'
                        }
                    });
                }
                break;
                
            case 'record':
                // List fields in record
                if (!ftpPath.schema || !ftpPath.record_id) {
                    throw new Error('Schema and record ID required');
                }
                
                const record = await system.database.selectOne(ftpPath.schema, { 
                    where: { id: ftpPath.record_id } 
                });
                
                if (!record) {
                    throw new Error(`Record not found: ${ftpPath.record_id}`);
                }
                
                const recordPermissions = FtpPermissionCalculator.calculatePermissions(system, record);
                
                // Add JSON file entry for the complete record
                entries.push({
                    name: `${ftpPath.record_id}.json`,
                    ftp_type: 'f',
                    ftp_size: JSON.stringify(record).length,
                    ftp_permissions: recordPermissions,
                    ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                    path: `/data/${ftpPath.schema}/${ftpPath.record_id}.json`,
                    api_context: {
                        schema: ftpPath.schema,
                        record_id: ftpPath.record_id,
                        access_level: recordPermissions.includes('w') ? 'edit' : 'read'
                    }
                });
                
                // Add individual field entries (for field-level access)
                for (const [fieldName, fieldValue] of Object.entries(record)) {
                    // Skip system fields in field listing
                    if (['id', 'created_at', 'updated_at', 'trashed_at', 'deleted_at'].includes(fieldName)) {
                        continue;
                    }
                    
                    const fieldSize = fieldValue ? JSON.stringify(fieldValue).length : 0;
                    
                    entries.push({
                        name: fieldName,
                        ftp_type: 'f',
                        ftp_size: fieldSize,
                        ftp_permissions: recordPermissions,
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                        path: `/data/${ftpPath.schema}/${ftpPath.record_id}/${fieldName}`,
                        api_context: {
                            schema: ftpPath.schema,
                            record_id: ftpPath.record_id,
                            field_name: fieldName,
                            access_level: recordPermissions.includes('w') ? 'edit' : 'read'
                        }
                    });
                }
                break;
                
            default:
                throw new Error(`Unsupported path type: ${ftpPath.type}`);
        }
        
        // Build response
        const response: FtpListResponse = {
            success: true,
            entries,
            total: entries.length,
            has_more: false // TODO: Implement pagination
        };
        
        system.info('FTP list completed', {
            path: requestBody.path,
            entryCount: entries.length,
            pathType: ftpPath.type
        });
        
        setRouteResult(context, response);
    } catch (error) {
        system.warn('FTP list failed', {
            path: requestBody.path,
            error: error instanceof Error ? error.message : String(error)
        });
        
        throw error;
    }
}