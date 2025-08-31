import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

// File Retrieve Transport Types
export interface FileRetrieveRequest {
    path: string; // "/data/accounts/123.json" or "/data/accounts/123/email"
    file_options: {
        binary_mode: boolean; // File transfer mode
        start_offset: number; // Resume support
        max_bytes?: number; // Partial transfer
        format?: 'json' | 'yaml' | 'raw';
    };
}

export interface FileRetrieveResponse {
    success: true;
    content: any; // File content
    file_metadata: {
        size: number; // Exact byte count
        modified_time: string; // File timestamp format
        content_type: string; // MIME type
        can_resume: boolean; // Supports partial transfers
        etag?: string; // For caching
    };
}

/**
 * File Content Formatter - Format content for File transfer
 */
class FileContentFormatter {
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
                return 'application/json';
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

    static formatFileTimestamp(date: Date | string): string {
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
 * POST /api/file/retrieve - File Retrieval Middleware
 *
 * Optimized file content retrieval with File metadata for monk-ftp integration.
 * Supports record-level and field-level access with resume capabilities.
 */
export default async function fileRetrieveHandler(context: Context): Promise<any> {
    const system = context.get('system');
    const requestBody: FileRetrieveRequest = await context.req.json();

    logger.info('File retrieve operation', {
        path: requestBody.path,
        options: requestBody.file_options,
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
            // Complete record: /data/accounts/123.json
            recordId = recordPart.replace('.json', '');

            record = await system.database.selectOne(schema, {
                where: { id: recordId },
            });

            if (!record) {
                throw new Error(`Record not found: ${recordId}`);
            }

            content = record;
        } else if (pathParts.length === 4) {
            // Specific field: /data/accounts/123/email
            recordId = recordPart;
            fieldName = pathParts[3];

            record = await system.database.selectOne(schema, {
                where: { id: recordId },
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
        const format = requestBody.file_options.format || 'json';
        const formattedContent = FileContentFormatter.formatContent(content, format, requestBody.file_options.binary_mode);

        // Handle partial content (resume support)
        let finalContent = formattedContent;
        if (requestBody.file_options.start_offset > 0) {
            finalContent = formattedContent.substring(requestBody.file_options.start_offset);
        }

        if (requestBody.file_options.max_bytes) {
            finalContent = finalContent.substring(0, requestBody.file_options.max_bytes);
        }

        // Calculate metadata
        const fullSize = FileContentFormatter.calculateSize(formattedContent);
        const actualSize = FileContentFormatter.calculateSize(finalContent);

        // Get record for timestamp (already retrieved above)

        const response: FileRetrieveResponse = {
            success: true,
            content: requestBody.file_options.format === 'raw' ? finalContent : JSON.parse(finalContent || 'null'),
            file_metadata: {
                size: actualSize,
                modified_time: FileContentFormatter.formatFileTimestamp(record?.updated_at || record?.created_at || new Date()),
                content_type: FileContentFormatter.getContentType(format, fieldName),
                can_resume: fullSize > actualSize,
                etag: FileContentFormatter.generateEtag(formattedContent),
            },
        };

        logger.info('File retrieve completed', {
            path: requestBody.path,
            schema,
            recordId,
            fieldName,
            contentSize: actualSize,
            fullSize,
            format,
        });

        setRouteResult(context, response);
    } catch (error) {
        logger.warn('File retrieve failed', {
            path: requestBody.path,
            error: error instanceof Error ? error.message : String(error),
        });

        throw error;
    }
}
