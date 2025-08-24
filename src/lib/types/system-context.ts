/**
 * System Context Types
 * 
 * Defines the context interface needed by business logic components,
 * breaking circular dependencies while maintaining clean architecture.
 */

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
 * SystemContext interface - Defines the context needed by business logic components
 * 
 * This interface provides the essential context information that Database, Schema,
 * and other business logic classes need without creating circular dependencies.
 * 
 * Design principles:
 * - Contains only business context, not infrastructure concerns
 * - Forward-compatible with Ring 5 observer architecture (Issue #94)
 * - Lightweight and easily mockable for testing
 */
export interface SystemContext {
    /** User ID from authentication context */
    readonly userId: string;
    
    /** Query behavior options (soft delete handling, etc.) */
    readonly options: Readonly<SystemOptions>;
    
    /**
     * Get comprehensive user information from the request context
     */
    getUser(): UserInfo;
    
    /**
     * Check if the current user has root access level
     */
    isRoot(): boolean;
}

/**
 * Extended system context that includes infrastructure concerns
 * Used during transition period before Ring 5 migration (Issue #94)
 */
export interface SystemContextWithInfrastructure extends SystemContext {
    /** Database/Transaction context for direct SQL access */
    readonly dtx: any; // Avoid importing DbContext/TxContext to prevent circular deps
    
    /** Database instance for high-level operations */
    readonly database: any; // Avoid importing Database class to prevent circular deps
    
    /** Track if we're already in a transaction to enable transaction reuse */
    readonly isInTransaction?: boolean;
}