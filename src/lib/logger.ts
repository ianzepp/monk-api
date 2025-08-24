/**
 * Standalone Logger Utility
 * 
 * Provides consistent logging with environment-aware formatting.
 * Can be used independently or through System class delegation.
 */

export interface LoggerContext {
    correlationId?: string;
    tenant?: string;
    operation?: string;
    userId?: string;
}

export class Logger {
    constructor(private context: LoggerContext = {}) {}

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
     * Log timing data with calculated elapsed time using hrtime precision
     * Takes start time from process.hrtime.bigint() and calculates duration
     */
    time(label: string, startTime: bigint, meta?: any): void {
        const endTime = process.hrtime.bigint();
        const durationNs = endTime - startTime;
        const durationMs = Number(durationNs) / 1_000_000;
        const elapsed = `${durationMs.toFixed(3)}ms`;
        
        console.info('[TIME]', label, elapsed, meta);
    }

    /**
     * Create child logger with additional context
     */
    child(additionalContext: Partial<LoggerContext>): Logger {
        return new Logger({ ...this.context, ...additionalContext });
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
                correlationId: this.context.correlationId,
                userId: this.context.userId,
                tenant: this.context.tenant,
                operation: this.context.operation,
                ...(meta && { meta })
            });
        } else {
            // Pretty format for development
            const correlationId = this.context.correlationId || 'no-req';
            const tenant = this.context.tenant || 'no-tenant';
            const ctx = `[${correlationId}]{${tenant}}`;
            const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
            return `${level} ${ctx} ${message}${metaStr}`;
        }
    }

    /**
     * Generate correlation ID for request tracking
     */
    static generateCorrelationId(): string {
        return 'req-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }
}

/**
 * Global logger instance for infrastructure components
 * Use this when System context is not available (server startup, middleware, etc.)
 */
export const logger = new Logger();