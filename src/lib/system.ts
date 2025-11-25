import type { TxContext } from '@src/db/index.js';
import type { Context } from 'hono';
import { Database } from '@src/lib/database.js';
import { Describe } from '@src/lib/describe.js';
import { NamespaceCacheManager, NamespaceCache } from '@src/lib/namespace-cache.js';
import type { SystemContext, SystemOptions, UserInfo } from '@src/lib/system-context-types.js';

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
export class System implements SystemContext {
    public readonly context: Context;
    public readonly userId: string;
    public readonly options: Readonly<SystemOptions>;
    public readonly correlationId: string;

    // Transaction context - set by withTransaction() with search_path configured
    // All tenant-scoped database operations MUST use this to ensure proper namespace isolation
    public tx!: TxContext;

    // System services
    public readonly database: Database;
    public readonly describe!: Describe;

    // Namespace cache bound to this request's db:ns (from JWT)
    public readonly namespace: NamespaceCache;

    constructor(c: Context, options: SystemOptions = {}) {
        this.context = c;

        // Initialize service instances with clean dependency injection
        // Note: system.tx is set by withTransaction() before any database operations
        this.database = new Database(this);
        this.describe = new Describe(this);

        // Bind namespace cache from JWT claims (db/ns set by jwt-validation middleware)
        // For routes without JWT (auth routes), these will be undefined
        const db = c.get('dbName') as string | undefined;
        const ns = c.get('nsName') as string | undefined;

        if (db && ns) {
            this.namespace = NamespaceCacheManager.getInstance().getNamespaceCache(db, ns);
        } else {
            // For auth routes that don't have tenant context, create a placeholder
            // These routes don't use namespace cache anyway
            this.namespace = null as any;
        }

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
