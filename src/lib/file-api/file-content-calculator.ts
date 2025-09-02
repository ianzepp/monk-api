import { logger } from '@src/lib/logger.js';

/**
 * FileContentCalculator - Unified content size and format calculation
 *
 * The authoritative implementation for File content calculations including
 * size computation, format detection, and content processing.
 *
 * Features: Accurate byte size calculation, content type detection,
 * format conversion, and consistent error handling.
 *
 * Quick Examples:
 * - Size: `FileContentCalculator.calculateSize(content)`
 * - Type: `FileContentCalculator.detectContentType(content)`
 * - Format: `FileContentCalculator.formatContent(content, 'json')`
 */
export class FileContentCalculator {
    /**
     * Calculate exact byte size of content
     * This is the authoritative entry point for all File content size calculation
     */
    static calculateSize(content: any): number {
        try {
            if (content === null || content === undefined) {
                return 0;
            }

            if (typeof content === 'string') {
                return Buffer.byteLength(content, 'utf8');
            }

            if (typeof content === 'object') {
                return Buffer.byteLength(JSON.stringify(content), 'utf8');
            }

            // Numbers, booleans, etc.
            return Buffer.byteLength(String(content), 'utf8');
        } catch (error) {
            logger.warn('FileContentCalculator size calculation failed', {
                contentType: typeof content,
                error: error instanceof Error ? error.message : String(error)
            });
            return 0;
        }
    }

    /**
     * Calculate size of complete JSON record
     */
    static calculateRecordSize(record: any): number {
        try {
            if (!record || typeof record !== 'object') {
                return 0;
            }

            return Buffer.byteLength(JSON.stringify(record), 'utf8');
        } catch (error) {
            logger.warn('FileContentCalculator record size calculation failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            return 0;
        }
    }

    /**
     * Calculate size of individual field value
     */
    static calculateFieldSize(fieldValue: any): number {
        try {
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
        } catch (error) {
            logger.warn('FileContentCalculator field size calculation failed', {
                fieldType: typeof fieldValue,
                error: error instanceof Error ? error.message : String(error)
            });
            return 0;
        }
    }

    /**
     * Detect content type from content analysis
     */
    static detectContentType(content: any, fieldName?: string): string {
        try {
            if (typeof content === 'string') {
                // Try to detect if it's JSON
                try {
                    JSON.parse(content);
                    return 'application/json';
                } catch {
                    // Use field name hints if available
                    if (fieldName) {
                        return FileContentCalculator.getContentTypeFromFieldName(fieldName);
                    }
                    return 'text/plain';
                }
            }

            if (typeof content === 'object' && content !== null) {
                return 'application/json';
            }

            if (typeof content === 'number' || typeof content === 'boolean') {
                return 'text/plain';
            }

            return 'application/octet-stream';
        } catch (error) {
            logger.warn('FileContentCalculator content type detection failed', {
                contentType: typeof content,
                fieldName,
                error: error instanceof Error ? error.message : String(error)
            });
            return 'application/octet-stream';
        }
    }

    /**
     * Get content type hints from field name
     */
    private static getContentTypeFromFieldName(fieldName: string): string {
        const field = fieldName.toLowerCase();

        if (field.includes('email')) return 'text/plain';
        if (field.includes('url') || field.includes('link')) return 'text/uri-list';
        if (field.includes('html')) return 'text/html';
        if (field.includes('css')) return 'text/css';
        if (field.includes('js') || field.includes('javascript')) return 'application/javascript';
        if (field.includes('json')) return 'application/json';
        if (field.includes('xml')) return 'application/xml';
        if (field.includes('phone') || field.includes('number')) return 'text/plain';

        return 'text/plain';
    }

    /**
     * Format content for File transfer
     */
    static formatContent(content: any, format: 'json' | 'raw', binaryMode: boolean = false): string {
        try {
            if (format === 'raw' || typeof content === 'string') {
                return String(content);
            }

            // JSON formatting with optional pretty-printing
            if (typeof content === 'object') {
                return JSON.stringify(content, null, binaryMode ? 0 : 2);
            }

            return String(content);
        } catch (error) {
            logger.warn('FileContentCalculator content formatting failed', {
                contentType: typeof content,
                format,
                binaryMode,
                error: error instanceof Error ? error.message : String(error)
            });
            return String(content);
        }
    }

    /**
     * Generate ETag for content caching
     */
    static generateETag(content: any): string {
        try {
            const crypto = require('crypto');
            const contentString = typeof content === 'string' ? content : JSON.stringify(content);
            return crypto.createHash('md5').update(contentString).digest('hex');
        } catch (error) {
            logger.warn('FileContentCalculator ETag generation failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            // Fallback ETag based on current time and content type
            return Buffer.from(`${Date.now()}-${typeof content}`).toString('base64').substring(0, 16);
        }
    }

    /**
     * Validate content for File operations
     */
    static validate(content: any, operation: 'store' | 'field'): void {
        if (content === undefined) {
            throw new Error('Content cannot be undefined');
        }

        // For field operations, ensure content is not an object unless it's JSON
        if (operation === 'field' && typeof content === 'object' && content !== null) {
            try {
                JSON.stringify(content);
            } catch (error) {
                throw new Error('Field content must be JSON-serializable');
            }
        }
    }

    /**
     * Process content with size limits and validation
     */
    static processContent(content: any, options: { 
        maxSize?: number; 
        format?: 'json' | 'raw'; 
        binaryMode?: boolean;
    } = {}): { content: string; size: number; contentType: string } {
        try {
            const format = options.format || 'json';
            const binaryMode = options.binaryMode || false;

            // Format the content
            const formattedContent = FileContentCalculator.formatContent(content, format, binaryMode);
            
            // Calculate size
            const size = FileContentCalculator.calculateSize(formattedContent);

            // Check size limits
            if (options.maxSize && size > options.maxSize) {
                throw new Error(`Content size ${size} exceeds maximum ${options.maxSize} bytes`);
            }

            // Detect content type
            const contentType = FileContentCalculator.detectContentType(content);

            return {
                content: formattedContent,
                size,
                contentType,
            };
        } catch (error) {
            logger.warn('FileContentCalculator content processing failed', {
                contentType: typeof content,
                options,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}