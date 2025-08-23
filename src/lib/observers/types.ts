/**
 * Observer Ring System Types
 * 
 * Defines the ring-based execution model for the observer system.
 * Observers execute in ordered rings 0-9, with ring 5 designated for database operations.
 */

/**
 * Observer execution rings (0-9) with semantic assignments
 */
export enum ObserverRing {
    Validation = 0,      // JSON Schema validation, input sanitization
    Security = 1,        // Access control, PII detection, rate limiting  
    Business = 2,        // Complex business logic, domain rules
    PreDatabase = 3,     // Final pre-database checks, transaction setup
    Enrichment = 4,      // Data enrichment, defaults, computed fields
    Database = 5,        // 🎯 DATABASE RING - SQL execution
    PostDatabase = 6,    // Immediate post-database processing
    Audit = 7,           // Audit logging, change tracking, compliance
    Integration = 8,     // External APIs, webhooks, cache invalidation
    Notification = 9     // User notifications, email alerts, real-time updates
}

/**
 * Database ring constant for easy reference
 */
export const DATABASE_RING = ObserverRing.Database;

/**
 * Database operation types that observers can target
 */
export type OperationType = 'create' | 'update' | 'delete' | 'select';

/**
 * Validation error collected during observer execution
 */
export interface ValidationError {
    message: string;
    field?: string;
    code?: string;
    ring?: ObserverRing;
    observer?: string;
}

/**
 * Non-blocking warning collected during observer execution
 */
export interface ValidationWarning {
    message: string;
    field?: string;
    code?: string;
    ring?: ObserverRing;
    observer?: string;
}

/**
 * Result of observer execution
 */
export interface ObserverResult {
    success: boolean;
    result?: any;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    metadata: Map<string, any>;
}

/**
 * Universal schema targeting keywords
 * Used in observer file paths to target all schemas
 */
export const UNIVERSAL_SCHEMA_KEYWORDS = ['%', 'all', '-'] as const;
export type UniversalSchemaKeyword = typeof UNIVERSAL_SCHEMA_KEYWORDS[number];

/**
 * Observer file pattern for directory structure:
 * src/observers/:schema/:ring_number/file-name.ts
 */
export interface ObserverFilePattern {
    schema: string | UniversalSchemaKeyword;
    ring: ObserverRing;
    filename: string;
    filepath: string;
}