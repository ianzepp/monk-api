import type { Context } from 'hono';
import { Database } from '@lib/database.js';
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
    public readonly userDomain: string;
    public readonly userId: string;
    public readonly options: Readonly<SystemOptions>;

    // System services
    public readonly database: Database;
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

        // Initialize Database instance with dependency injection
        this.dtx = dtx;
        this.database = new Database(this, this.dtx);
        
        // Store query options as read-only
        this.options = Object.freeze({ ...options });
        
        // Extract user information from context (set by auth middleware)
        this.userDomain = c.get('userDomain') || 'default';
        this.userId = c.get('userId') || 'anonymous';
    }

    /**
     * Get user information from the request context
     * Implementation of SystemContext interface
     */
    getUser(): UserInfo {
        return {
            id: this.userId,
            tenant: this.userDomain,
            role: this.context.get('userRole') || 'user',
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
}