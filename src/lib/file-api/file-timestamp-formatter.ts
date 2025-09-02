import { logger } from '@src/lib/logger.js';

/**
 * FileTimestampFormatter - Unified timestamp formatting for File API operations
 *
 * The authoritative implementation for File protocol timestamp formatting.
 * Provides consistent timestamp handling across all File API routes.
 *
 * Features: FTP-compatible YYYYMMDDHHMMSS format, timezone handling,
 * best timestamp selection, and proper error handling.
 *
 * Quick Examples:
 * - Format: `FileTimestampFormatter.format(new Date())`
 * - Best: `FileTimestampFormatter.getBestTimestamp(record)`
 * - Current: `FileTimestampFormatter.current()`
 */
export class FileTimestampFormatter {
    /**
     * Format date to FTP timestamp: YYYYMMDDHHMMSS
     * This is the authoritative entry point for all File timestamp formatting
     */
    static format(date: Date | string): string {
        try {
            const d = new Date(date);
            
            if (isNaN(d.getTime())) {
                logger.warn('Invalid date provided to FileTimestampFormatter', { date });
                return FileTimestampFormatter.current();
            }

            const year = d.getUTCFullYear();
            const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
            const day = d.getUTCDate().toString().padStart(2, '0');
            const hour = d.getUTCHours().toString().padStart(2, '0');
            const minute = d.getUTCMinutes().toString().padStart(2, '0');
            const second = d.getUTCSeconds().toString().padStart(2, '0');

            return `${year}${month}${day}${hour}${minute}${second}`;
        } catch (error) {
            logger.warn('FileTimestampFormatter format failed', {
                date,
                error: error instanceof Error ? error.message : String(error)
            });
            return FileTimestampFormatter.current();
        }
    }

    /**
     * Get current timestamp in FTP format
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
     * Convert FTP timestamp to ISO format
     */
    static toISO(ftpTimestamp: string): string {
        try {
            if (ftpTimestamp.length !== 14) {
                throw new Error('FTP timestamp must be 14 characters: YYYYMMDDHHMMSS');
            }

            const year = ftpTimestamp.substring(0, 4);
            const month = ftpTimestamp.substring(4, 6);
            const day = ftpTimestamp.substring(6, 8);
            const hour = ftpTimestamp.substring(8, 10);
            const minute = ftpTimestamp.substring(10, 12);
            const second = ftpTimestamp.substring(12, 14);

            const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
            const date = new Date(isoString);

            if (isNaN(date.getTime())) {
                throw new Error('Invalid FTP timestamp format');
            }

            return date.toISOString();
        } catch (error) {
            logger.warn('FileTimestampFormatter toISO failed', {
                ftpTimestamp,
                error: error instanceof Error ? error.message : String(error)
            });
            return new Date().toISOString();
        }
    }

    /**
     * Validate FTP timestamp format
     */
    static validate(ftpTimestamp: string): boolean {
        try {
            if (typeof ftpTimestamp !== 'string' || ftpTimestamp.length !== 14) {
                return false;
            }

            // Check if all characters are digits
            if (!/^\d{14}$/.test(ftpTimestamp)) {
                return false;
            }

            // Validate the ISO conversion
            const isoString = FileTimestampFormatter.toISO(ftpTimestamp);
            const date = new Date(isoString);
            
            return !isNaN(date.getTime());
        } catch (error) {
            return false;
        }
    }
}