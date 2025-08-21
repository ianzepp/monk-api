import type { Context } from 'hono';
import { Database } from './database.js';
import { DatabaseManager } from './database-manager.js';
import type { DbContext, TxContext } from '../db/index.js';

/**
 * System options for controlling query behavior
 */
export interface SystemOptions {
    /** Include trashed records (soft deletes) in query results */
    trashed?: boolean;
    /** Include permanently deleted records in query results (root access only) */
    deleted?: boolean;
}

/**
 * System class - Per-request context management
 * 
 * Initialized at the top-level route handler with Hono context.
 * Provides access to properly contextualized database operations.
 * Replaces singleton pattern with per-request instance pattern.
 */
export class System {
    public readonly context: Context;
    public readonly userDomain: string;
    public readonly userId: string;
    public readonly options: Readonly<SystemOptions>;

    // System services
    public readonly database: Database;
    public readonly dtx: DbContext | TxContext;

    constructor(c: Context, dtx?: DbContext | TxContext, options: SystemOptions = {}) {
        this.context = c;
        
        // Get database context from Hono context or use provided one
        if (dtx === undefined) {
            dtx = DatabaseManager.getDatabaseFromContext(c);
        }
        
        if (dtx === undefined) {
            throw new Error('Unable to initialize database or transaction context.');   
        }

        // Initialize Database instance with this system reference 
        this.dtx = dtx;
        this.database = new Database(this);
        
        // Store query options as read-only
        this.options = Object.freeze({ ...options });
        
        // Extract user information from context (set by auth middleware)
        this.userDomain = c.get('userDomain') || 'default';
        this.userId = c.get('userId') || 'anonymous';
    }

    /**
     * Get user information from the request context
     */
    getUser() {
        return {
            id: this.userId,
            domain: this.userDomain,
            role: this.context.get('userRole') || 'user',
            accessRead: this.context.get('accessReadIds') || [],
            accessEdit: this.context.get('accessEditIds') || [],
            accessFull: this.context.get('accessFullIds') || [],
        };
    }
}