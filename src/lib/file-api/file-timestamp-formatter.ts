import { logger } from '@src/lib/logger.js';

/**
 * FileTimestampFormatter - Unified timestamp formatting for File API operations
 *
 * The authoritative implementation for File protocol timestamp formatting.
 * Provides consistent timestamp handling across all File API routes.
 *
 * Features: ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ), timezone handling,
 * best timestamp selection, and proper error handling.
 *
 * Quick Examples:
 * - Format: `FileTimestampFormatter.format(new Date())`
 * - Best: `FileTimestampFormatter.getBestTimestamp(record)`
 * - Current: `FileTimestampFormatter.current()`
 */
export class FileTimestampFormatter {
    /**
     * Format date to ISO 8601 timestamp: YYYY-MM-DDTHH:mm:ss.sssZ
     * This is the authoritative entry point for all File timestamp formatting
     */
    static format(date: Date | string): string {
        try {
            const d = new Date(date);

            if (isNaN(d.getTime())) {
                logger.warn('Invalid date provided to FileTimestampFormatter', { date });
                return FileTimestampFormatter.current();
            }

            return d.toISOString();
        } catch (error) {
            logger.warn('FileTimestampFormatter format failed', {
                date,
                error: error instanceof Error ? error.message : String(error)
            });
            return FileTimestampFormatter.current();
        }
    }

    /**
     * Get current timestamp in ISO 8601 format
     */
    static current(): string {
        return FileTimestampFormatter.format(new Date());
    }

    /**
     * Get best available timestamp from record with source tracking
     */
    static getBestTimestamp(record: any): { 
        timestamp: Date; 
        source: 'updated_at' | 'created_at' | 'current_time';
        formatted: string;
    } {
        try {
            // Prefer updated_at if available
            if (record?.updated_at) {
                const timestamp = new Date(record.updated_at);
                if (!isNaN(timestamp.getTime())) {
                    return {
                        timestamp,
                        source: 'updated_at',
                        formatted: FileTimestampFormatter.format(timestamp),
                    };
                }
            }

            // Fall back to created_at
            if (record?.created_at) {
                const timestamp = new Date(record.created_at);
                if (!isNaN(timestamp.getTime())) {
                    return {
                        timestamp,
                        source: 'created_at',
                        formatted: FileTimestampFormatter.format(timestamp),
                    };
                }
            }

            // Last resort - current time
            const timestamp = new Date();
            return {
                timestamp,
                source: 'current_time',
                formatted: FileTimestampFormatter.format(timestamp),
            };
        } catch (error) {
            logger.warn('FileTimestampFormatter getBestTimestamp failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            
            const timestamp = new Date();
            return {
                timestamp,
                source: 'current_time',
                formatted: FileTimestampFormatter.format(timestamp),
            };
        }
    }

    /**
     * Convert ISO 8601 timestamp to ISO format (normalize)
     * @deprecated This method is maintained for backward compatibility
     */
    static toISO(timestamp: string): string {
        try {
            const date = new Date(timestamp);

            if (isNaN(date.getTime())) {
                throw new Error('Invalid timestamp format');
            }

            return date.toISOString();
        } catch (error) {
            logger.warn('FileTimestampFormatter toISO failed', {
                timestamp,
                error: error instanceof Error ? error.message : String(error)
            });
            return new Date().toISOString();
        }
    }

    /**
     * Validate ISO 8601 timestamp format
     */
    static validate(timestamp: string): boolean {
        try {
            if (typeof timestamp !== 'string') {
                return false;
            }

            const date = new Date(timestamp);

            return !isNaN(date.getTime());
        } catch (error) {
            return false;
        }
    }
}