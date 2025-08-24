import type { Context } from 'hono';
import { Database } from '@lib/database.js';
import { Metabase } from '@lib/metabase.js';
import { DatabaseManager } from '@lib/database-manager.js';
import type { DbContext, TxContext } from '@src/db/index.js';
import type { SystemContextWithInfrastructure, SystemOptions, UserInfo } from '@lib/types/system-context.js';

/**
 * System class - Per-request context management
 * 
 * Initialized at the top-level route handler with Hono context.
 * Provides access to properly contextualized database operations.
 * Replaces singleton pattern with per-request instance pattern.
 * 
 * Implements SystemContext interface to provide business context to other components
 * while breaking circular dependencies through dependency injection.
 */
export class System implements SystemContextWithInfrastructure {
    public readonly context: Context;
    public readonly userId: string;
    public readonly options: Readonly<SystemOptions>;
    public readonly correlationId: string;

    // System services
    public readonly database: Database;
    public readonly metabase: Metabase;
    public readonly dtx: DbContext | TxContext;
    public readonly isInTransaction: boolean = false;

    constructor(c: Context, dtx?: DbContext | TxContext, options: SystemOptions = {}) {
        this.context = c;
        
        // Get database context from Hono context or use provided one
        if (dtx === undefined) {
            dtx = DatabaseManager.getDatabaseFromContext(c);
        }
        
        if (dtx === undefined) {
            throw new Error('Unable to initialize database or transaction context.');   
        }

        // Initialize service instances with dependency injection
        this.dtx = dtx;
        this.database = new Database(this, this.dtx);
        this.metabase = new Metabase(this);
        
        // Store query options as read-only
        this.options = Object.freeze({ ...options });
        
        // Extract user information from context (set by auth middleware)
        this.userId = c.get('userId') || 'anonymous';
        
        // Generate correlation ID once per request
        this.correlationId = c.req.header('x-request-id') || this.generateCorrelationId();
    }

    /**
     * Get user information from the request context
     * Implementation of SystemContext interface
     */
    getUser(): UserInfo {
        const payload = this.context.get('jwtPayload') as any;
        return {
            id: this.userId,
            tenant: payload?.tenant || 'unknown',
            role: payload?.access || 'user',
            accessRead: this.context.get('accessReadIds') || [],
            accessEdit: this.context.get('accessEditIds') || [],
            accessFull: this.context.get('accessFullIds') || [],
        };
    }

    /**
     * Check if the current user has root access level
     * Implementation of SystemContext interface
     */
    isRoot(): boolean {
        const payload = this.context.get('jwtPayload') as any;
        return payload?.access === 'root';
    }

    /**
     * Log info message with request context
     */
    info(message: string, meta?: any) {
        console.info(this.formatLog('INFO', message, meta));
    }
    
    /**
     * Log warning message with request context
     */
    warn(message: string, meta?: any) {
        console.warn(this.formatLog('WARN', message, meta));
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
                correlationId: this.correlationId,
                userId: this.userId,
                tenant: this.getTenant(),
                operation: `${this.context.req.method} ${this.context.req.path}`,
                ...(meta && { meta })
            });
        } else {
            // Pretty format for development
            const ctx = `[${this.correlationId}]{${this.getTenant()}}`;
            const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
            return `${level} ${ctx} ${message}${metaStr}`;
        }
    }

    /**
     * Get actual tenant name from JWT payload
     */
    private getTenant(): string {
        const payload = this.context.get('jwtPayload') as any;
        return payload?.tenant || 'unknown';
    }

    /**
     * Generate correlation ID for request tracking
     */
    private generateCorrelationId(): string {
        return 'req-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }
}