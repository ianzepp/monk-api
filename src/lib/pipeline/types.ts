/**
 * Pipeline Ring System Types
 *
 * Defines the ring-based execution model for the observer system.
 * Pipelines execute in ordered rings 0-9, with ring 5 designated for database operations.
 */

/**
 * Pipeline execution rings (0-9) with semantic assignments
 */
export enum PipelineRing {
    DataPreparation = 0, // Data loading, merging, input preparation
    InputValidation = 1, // Schema validation, format checks, basic integrity
    Security = 2,        // Access control, protection policies, rate limiting
    Business = 3,        // Complex business logic, domain rules, workflows
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
export const DATABASE_RING = PipelineRing.Database;

/**
 * Database operation types that observers can target
 * Includes revert operation for undoing soft deletes
 */
export type OperationType = 'create' | 'update' | 'delete' | 'select' | 'revert';

/**
 * Ring execution matrix - defines which rings execute for each operation type
 *
 * This optimizes performance by skipping irrelevant rings for certain operations.
 * For example, selects skip business logic rings since they don't modify data.
 */
export const RING_OPERATION_MATRIX = {
    'select': [0, 1, 5, 8, 9],           // Validation, Security, Database, Integration, Notification
    'create': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],  // ALL rings
    'update': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],  // ALL rings
    'delete': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],  // ALL rings
    'revert': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],  // ALL rings - undoing soft deletes
} as const;

/**
 * Result of observer execution
 */
export interface PipelineResult {
    success: boolean;
    result?: any;
    errors: any[]; // ValidationError instances from errors.js
    warnings: any[]; // ValidationWarning instances from errors.js
    metadata: Map<string, any>;
}

/**
 * Universal schema targeting keyword
 * Used in observer file paths to target all schemas
 */
export const UNIVERSAL_SCHEMA_KEYWORD = 'all' as const;
export type UniversalSchemaKeyword = typeof UNIVERSAL_SCHEMA_KEYWORD;

/**
 * Pipeline file pattern for directory structure:
 * src/pipeline/:schema/:ring_number/file-name.ts
 */
export interface PipelineFilePattern {
    schema: string | UniversalSchemaKeyword;
    ring: PipelineRing;
    filename: string;
    filepath: string;
}
