/**
 * System Context Types
 *
 * Defines the context interface needed by business logic components,
 * breaking circular dependencies while maintaining clean architecture.
 */

import type { Context } from 'hono';

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
 * User information extracted from request context
 */
export interface UserInfo {
    id: string;
    tenant: string;
    role: string;
    accessRead: string[];
    accessEdit: string[];
    accessFull: string[];
}

/**
 * System Context - Per-request context for database operations
 *
 * Provides business context (user, options) and infrastructure (db, tx, services)
 * to all database operations, models, and observers.
 *
 * Design principles:
 * - Per-request instance pattern (not singleton)
 * - Dependency injection to break circular dependencies
 * - Contains both business context and infrastructure concerns
 */
export interface SystemContext {
    /** User ID from authentication context */
    readonly userId: string;

    /** Query behavior options (soft delete handling, etc.) */
    readonly options: Readonly<SystemOptions>;

    /** Hono request context for accessing request/response and context variables */
    readonly context: Context;

    /** Transaction context with search_path configured for namespace isolation
     *  Set by withTransaction() before any database operations execute */
    tx: any; // Avoid importing pg.PoolClient to prevent circular deps

    /** Database instance for high-level operations */
    readonly database: any; // Avoid importing Database class to prevent circular deps

    /** Describe instance for model operations */
    readonly describe: any; // Avoid importing Describe class to prevent circular deps

    /**
     * Get comprehensive user information from the request context
     */
    getUser(): UserInfo;

    /**
     * Check if the current user has root access level
     */
    isRoot(): boolean;
}
