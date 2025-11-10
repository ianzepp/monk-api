import type { DbContext, TxContext } from '@src/db/index.js';
import type { Context } from 'hono';
import { Database } from '@src/lib/database.js';
import { Describe } from '@src/lib/describe.js';
import type { SystemContextWithInfrastructure, SystemOptions, UserInfo } from '@src/lib/system-context-types.js';

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

    // Database context - always available for database operations
    public readonly db: DbContext;

    // Transaction context - set by SQL Observer when transactions needed
    public tx?: TxContext;

    // System services
    public readonly database: Database;
    public readonly describe!: Describe;

    constructor(c: Context, options: SystemOptions = {}) {
        this.context = c;

        // Get database connection from Hono context (always required)
        const db = c.get('database');
        if (!db) {
            throw new Error('Database context not set - ensure JWT middleware is applied');
        }

        if (!db) {
            throw new Error('Unable to initialize database connection - ensure database middleware is applied');
        }

        // Initialize database connection (always available)
        this.db = db;
        this.tx = undefined; // Will be set by SQL Observer when transactions needed

        // Initialize service instances with clean dependency injection
        this.database = new Database(this);
        this.describe = new Describe(this);

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
