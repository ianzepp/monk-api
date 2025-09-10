/**
 * Standalone Logger Utility
 *
 * Provides consistent logging with environment-aware formatting.
 */

export class Logger {
    constructor() {}

    /**
     * Log info message with context
     */
    debug(message: string, meta?: any) {
        console.info(this.formatLog('DEBUG', message, meta));
    }

    /**
     * Log info message with context
     */
    info(message: string, meta?: any) {
        console.info(this.formatLog('INFO', message, meta));
    }

    /**
     * Log warning message with context
     */
    warn(message: string, meta?: any) {
        console.warn(this.formatLog('WARN', message, meta));
    }

    /**
     * Log failure message with context
     */
    fail(message: string, meta?: any) {
        console.error(this.formatLog('FAIL', message, meta));
    }

    /**
     * Log failure message with context
     */
    error(message: string, meta?: any) {
        console.error(this.formatLog('ERROR', message, meta));
    }

    /**
     * Log timing data with calculated elapsed time using hrtime precision
     * Takes start time from process.hrtime.bigint() and calculates duration
     */
    time(label: string, startTime: bigint, meta: any = {}): void {
        const endTime = process.hrtime.bigint();
        const durationNs = endTime - startTime;
        const durationMs = Number(durationNs) / 1_000_000;
        console.info('[TIME] %s %sms %j', label, durationMs, meta);
    }

    /**
     * Format log message with environment-aware output
     */
    private formatLog(level: string, message: string, meta?: any): string {
        const timestamp = new Date().toISOString();

        if (process.env.NODE_ENV === 'production') {
            // Structured JSON for production log aggregation
            return JSON.stringify({
                timestamp,
                level,
                message,
                ...(describe && { describe })
            });
        } else {
            // Pretty format for development
            const metaStr = describe ? ` ${JSON.stringify(meta)}` : '';
            return `${level} ${message}${metaStr}`;
        }
    }
}

/**
 * Global logger instance for infrastructure components
 * Use this when System context is not available (server startup, middleware, etc.)
 */
export const logger = new Logger();
