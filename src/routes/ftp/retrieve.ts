import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

// FTP Retrieve Transport Types
export interface FtpRetrieveRequest {
    path: string;                   // "/data/account/123.json" or "/data/account/123/email"
    ftp_options: {
        binary_mode: boolean;       // FTP transfer mode
        start_offset: number;       // Resume support
        max_bytes?: number;         // Partial transfer
        format?: 'json' | 'yaml' | 'raw';
    };
}

export interface FtpRetrieveResponse {
    success: true;
    content: any;                   // File content
    ftp_metadata: {
        size: number;               // Exact byte count
        modified_time: string;      // FTP timestamp format
        content_type: string;       // MIME type
        can_resume: boolean;        // Supports partial transfers
        etag?: string;             // For caching
    };
}

/**
 * FTP Content Formatter - Format content for FTP transfer
 */
class FtpContentFormatter {
    static formatContent(content: any, format: 'json' | 'yaml' | 'raw', binaryMode: boolean): string {
        if (format === 'raw' || typeof content === 'string') {
            return String(content);
        }
        
        if (format === 'yaml') {
            // TODO: Add YAML formatting when needed
            return JSON.stringify(content, null, 2);
        }
        
        // Default JSON formatting
        return JSON.stringify(content, null, binaryMode ? 0 : 2);
    }
    
    static calculateSize(content: string): number {
        return Buffer.byteLength(content, 'utf8');
    }
    
    static getContentType(format: 'json' | 'yaml' | 'raw', fieldName?: string): string {
        switch (format) {
            case 'json':
                return 'application/json';
            case 'yaml':
                return 'application/yaml';
            case 'raw':
                // Guess content type based on field name
                if (fieldName?.includes('email')) return 'text/plain';
                if (fieldName?.includes('url') || fieldName?.includes('link')) return 'text/uri-list';
                if (fieldName?.includes('html')) return 'text/html';
                return 'text/plain';
            default:
                return 'application/octet-stream';
        }
    }
    
    static generateEtag(content: string): string {
        // Simple ETag generation for caching
        const crypto = require('crypto');
        return crypto.createHash('md5').update(content).digest('hex');
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
 * POST /ftp/retrieve - File Retrieval Middleware
 * 
 * Optimized file content retrieval with FTP metadata for monk-ftp integration.
 * Supports record-level and field-level access with resume capabilities.
 */
export default async function ftpRetrieveHandler(context: Context): Promise<any> {
    const system = context.get('system');
    const requestBody: FtpRetrieveRequest = await context.req.json();
    
    logger.info('FTP retrieve operation', { 
        path: requestBody.path,
        options: requestBody.ftp_options 
    });
    
    try {
        // Parse path to determine what to retrieve
        const pathParts = requestBody.path.split('/').filter(p => p.length > 0);
        
        // Handle different path patterns
        if (pathParts.length < 3) {
            throw new Error('Invalid path for file retrieval');
        }
        
        const [dataPrefix, schema, recordPart] = pathParts;
        
        if (dataPrefix !== 'data') {
            throw new Error('Only /data/* paths supported for retrieval');
        }
        
        let recordId: string;
        let fieldName: string | undefined;
        let content: any;
        let record: any; // Store record for metadata
        
        // Check if path is record.json or record/field
        if (recordPart.endsWith('.json')) {
            // Complete record: /data/account/123.json
            recordId = recordPart.replace('.json', '');
            
            record = await system.database.selectOne(schema, { 
                where: { id: recordId } 
            });
            
            if (!record) {
                throw new Error(`Record not found: ${recordId}`);
            }
            
            content = record;
            
        } else if (pathParts.length === 4) {
            // Specific field: /data/account/123/email
            recordId = recordPart;
            fieldName = pathParts[3];
            
            record = await system.database.selectOne(schema, { 
                where: { id: recordId } 
            });
            
            if (!record) {
                throw new Error(`Record not found: ${recordId}`);
            }
            
            if (!(fieldName in record)) {
                throw new Error(`Field not found: ${fieldName}`);
            }
            
            content = record[fieldName];
            
        } else {
            throw new Error('Invalid path format for file retrieval');
        }
        
        // Format content based on options
        const format = requestBody.ftp_options.format || 'json';
        const formattedContent = FtpContentFormatter.formatContent(
            content, 
            format, 
            requestBody.ftp_options.binary_mode
        );
        
        // Handle partial content (resume support)
        let finalContent = formattedContent;
        if (requestBody.ftp_options.start_offset > 0) {
            finalContent = formattedContent.substring(requestBody.ftp_options.start_offset);
        }
        
        if (requestBody.ftp_options.max_bytes) {
            finalContent = finalContent.substring(0, requestBody.ftp_options.max_bytes);
        }
        
        // Calculate metadata
        const fullSize = FtpContentFormatter.calculateSize(formattedContent);
        const actualSize = FtpContentFormatter.calculateSize(finalContent);
        
        // Get record for timestamp (already retrieved above)
        
        const response: FtpRetrieveResponse = {
            success: true,
            content: requestBody.ftp_options.format === 'raw' ? finalContent : JSON.parse(finalContent || 'null'),
            ftp_metadata: {
                size: actualSize,
                modified_time: FtpContentFormatter.formatFtpTimestamp(record?.updated_at || record?.created_at || new Date()),
                content_type: FtpContentFormatter.getContentType(format, fieldName),
                can_resume: fullSize > actualSize,
                etag: FtpContentFormatter.generateEtag(formattedContent)
            }
        };
        
        logger.info('FTP retrieve completed', {
            path: requestBody.path,
            schema,
            recordId,
            fieldName,
            contentSize: actualSize,
            fullSize,
            format
        });
        
        setRouteResult(context, response);
        
    } catch (error) {
        logger.warn('FTP retrieve failed', {
            path: requestBody.path,
            error: error instanceof Error ? error.message : String(error)
        });
        
        throw error;
    }
}