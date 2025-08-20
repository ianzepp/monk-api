import type { Context } from 'hono';
import { Database } from './database.js';
import { DatabaseManager } from './database-manager.js';
import type { DbContext, TxContext } from '../db/index.js';

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

    // System services
    public readonly database: Database;
    public readonly dtx: DbContext | TxContext;

    constructor(c: Context, dtx?: DbContext | TxContext) {
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
        
        // Extract user information from context (set by auth middleware)
        this.userDomain = c.get('userDomain') || 'default';
        this.userId = c.get('userId') || 'anonymous';
    }

    /**
     * Execute function within a database transaction
     * Creates a new System instance with transaction context
     */
    static async handleDb<T>(context: Context, fn: (system: System) => Promise<T>): Promise<T> {
        const contextDb = DatabaseManager.getDatabaseFromContext(context);
        return await fn(new System(context, contextDb));
    }

    static async handleTx<T>(context: Context, fn: (system: System) => Promise<T>): Promise<T> {
        const contextDb = DatabaseManager.getDatabaseFromContext(context);

        return await contextDb.transaction(async (contextTx: TxContext) => {
            return await fn(new System(context, contextTx));
        });        

        // TODO does a failure above rollback the transaction?
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