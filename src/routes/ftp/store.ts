import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

// FTP Store Transport Types
export interface FtpStoreRequest {
    path: string;                   // "/data/account/new-account.json" or "/data/account/123/email"
    content: any;                   // Record data or field value
    ftp_options: {
        binary_mode: boolean;       // FTP transfer mode
        overwrite: boolean;         // Allow overwriting existing records
        append_mode: boolean;       // FTP append vs replace
        create_path: boolean;       // Auto-create intermediate directories
        resume_offset?: number;     // Resume partial uploads
        atomic: boolean;            // Atomic operation (default: true)
    };
    metadata?: {
        content_type?: string;      // MIME type hint
        encoding?: string;         // Content encoding
        expected_size?: number;    // For validation
        checksum?: string;        // Content verification
    };
}

export interface FtpStoreResponse {
    success: true;
    operation: 'create' | 'update' | 'append';
    result: {
        path: string;               // Final storage path
        record_id: string;         // Created/updated record ID
        size: number;              // Final size
        created: boolean;          // Was record created?
        updated: boolean;          // Was record updated?
    };
    ftp_metadata: {
        modified_time: string;      // FTP timestamp format
        permissions: string;        // User's permissions on created/updated record
        can_resume: boolean;       // Future resume support
    };
    warnings?: string[];           // Non-fatal warnings
}

/**
 * FTP Content Parser - Parse and validate content for storage
 */
class FtpContentParser {
    static parseContent(content: any, contentType?: string): any {
        if (typeof content === 'string') {
            // Try to parse as JSON if it looks like JSON
            if (contentType === 'application/json' || this.looksLikeJson(content)) {
                try {
                    return JSON.parse(content);
                } catch {
                    return content; // Keep as string if parsing fails
                }
            }
        }
        
        return content;
    }
    
    static looksLikeJson(str: string): boolean {
        const trimmed = str.trim();
        return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
               (trimmed.startsWith('[') && trimmed.endsWith(']'));
    }
    
    static validateContent(content: any, schema: any): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        try {
            // Use schema validation if available
            if (schema && schema.validateOrThrow) {
                schema.validateOrThrow(content);
            }
            return { valid: true, errors: [] };
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            return { valid: false, errors };
        }
    }
    
    static generateRecordId(): string {
        return require('crypto').randomUUID();
    }
}

/**
 * FTP Store Path Handler - Handle different storage path patterns
 */
class FtpStorePathHandler {
    static parsePath(path: string): {
        schema: string;
        recordId?: string;
        fieldName?: string;
        isNewRecord: boolean;
        isFieldUpdate: boolean;
    } {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '');
        const parts = cleanPath.split('/').filter(p => p.length > 0);
        
        if (parts.length < 2 || parts[0] !== 'data') {
            throw new Error('Invalid FTP store path - must start with /data/');
        }
        
        const schema = parts[1];
        
        // /data/schema/new-record.json (create new record)
        if (parts.length === 3 && parts[2].endsWith('.json')) {
            const recordId = parts[2].replace('.json', '');
            return {
                schema,
                recordId,
                isNewRecord: true,
                isFieldUpdate: false
            };
        }
        
        // /data/schema/existing-record-id/field (update field)
        if (parts.length === 4) {
            return {
                schema,
                recordId: parts[2],
                fieldName: parts[3],
                isNewRecord: false,
                isFieldUpdate: true
            };
        }
        
        throw new Error(`Unsupported FTP store path format: ${path}`);
    }
}

/**
 * POST /ftp/store - File Storage Middleware
 * 
 * Handles file storage operations for FTP STOR command.
 * Supports both record creation and field-level updates.
 */
export default async function ftpStoreHandler(context: Context): Promise<any> {
    const system = context.get('system');
    const requestBody: FtpStoreRequest = await context.req.json();
    
    system.info('FTP store operation', { 
        path: requestBody.path,
        options: requestBody.ftp_options,
        contentSize: JSON.stringify(requestBody.content).length
    });
    
    try {
        // Parse the storage path
        const pathInfo = FtpStorePathHandler.parsePath(requestBody.path);
        
        let operation: 'create' | 'update' | 'append';
        let result: any;
        let recordId: string;
        
        if (pathInfo.isNewRecord) {
            // Create new record
            if (!requestBody.ftp_options.overwrite) {
                // Check if record already exists
                const existing = await system.database.selectOne(pathInfo.schema, {
                    where: { id: pathInfo.recordId }
                });
                
                if (existing) {
                    throw new Error(`Record already exists: ${pathInfo.recordId}. Use overwrite=true to replace.`);
                }
            }
            
            // Parse and validate content
            const parsedContent = FtpContentParser.parseContent(
                requestBody.content, 
                requestBody.metadata?.content_type
            );
            
            // Get schema for validation
            const schema = await system.database.toSchema(pathInfo.schema);
            const validation = FtpContentParser.validateContent(parsedContent, schema);
            
            if (!validation.valid) {
                throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
            }
            
            // Set record ID if not provided
            recordId = pathInfo.recordId || FtpContentParser.generateRecordId();
            
            // Create the record
            result = await system.database.createOne(pathInfo.schema, {
                id: recordId,
                ...parsedContent
            });
            
            operation = 'create';
            
        } else if (pathInfo.isFieldUpdate) {
            // Update specific field
            if (!pathInfo.recordId || !pathInfo.fieldName) {
                throw new Error('Record ID and field name required for field update');
            }
            
            recordId = pathInfo.recordId;
            
            // Check if record exists
            const existingRecord = await system.database.selectOne(pathInfo.schema, {
                where: { id: recordId }
            });
            
            if (!existingRecord) {
                throw new Error(`Record not found: ${recordId}`);
            }
            
            // Parse field content
            const parsedContent = FtpContentParser.parseContent(
                requestBody.content,
                requestBody.metadata?.content_type
            );
            
            // Update the specific field
            const updateData = { [pathInfo.fieldName]: parsedContent };
            
            result = await system.database.updateOne(pathInfo.schema, recordId, updateData);
            operation = 'update';
            
        } else {
            throw new Error('Unsupported store operation type');
        }
        
        // Calculate final content size
        const formattedContent = JSON.stringify(result, null, requestBody.ftp_options.binary_mode ? 0 : 2);
        const finalSize = Buffer.byteLength(formattedContent, 'utf8');
        
        // Build response
        const response: FtpStoreResponse = {
            success: true,
            operation,
            result: {
                path: requestBody.path,
                record_id: recordId,
                size: finalSize,
                created: operation === 'create',
                updated: operation === 'update'
            },
            ftp_metadata: {
                modified_time: FtpContentFormatter.formatFtpTimestamp(result.updated_at || result.created_at || new Date()),
                permissions: 'rwx', // TODO: Calculate from user ACL
                can_resume: false   // TODO: Implement resume support
            }
        };
        
        system.info('FTP store completed', {
            path: requestBody.path,
            operation,
            recordId,
            finalSize,
            fieldName: pathInfo.fieldName
        });
        
        setRouteResult(context, response);
        
    } catch (error) {
        system.warn('FTP store failed', {
            path: requestBody.path,
            error: error instanceof Error ? error.message : String(error)
        });
        
        throw error;
    }
}

// Helper functions for content formatting
const FtpContentFormatter = {
    formatFtpTimestamp: (date: Date | string): string => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const hour = d.getHours().toString().padStart(2, '0');
        const minute = d.getMinutes().toString().padStart(2, '0');
        const second = d.getSeconds().toString().padStart(2, '0');
        
        return `${year}${month}${day}${hour}${minute}${second}`;
    }
};