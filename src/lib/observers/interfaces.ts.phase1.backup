/**
 * Observer Framework Interfaces
 * 
 * Core interfaces for the observer ring system including context sharing,
 * observer definitions, and execution contracts.
 */

import type { System } from '@src/lib/system.js';
import type { Schema } from '@src/lib/schema.js';
import type { 
    ObserverRing, 
    OperationType, 
    ObserverResult 
} from '@src/lib/observers/types.js';
import type { ValidationError, ValidationWarning } from '@src/lib/observers/errors.js';

/**
 * Shared context passed through all observer rings
 * Contains request state, data, and cross-observer communication
 */
export interface ObserverContext {
    /** Per-request database system context */
    system: System;

    /** Database operation being performed */
    operation: OperationType;

    /** Target schema name */
    schemaName: string;

    /** Loaded Schema object with validation and metadata */
    schema: Schema;

    /** Input data for create/update operations */
    data?: any;

    /** Filter criteria for select operations (rings 0-4), becomes data after ring 5 */
    filter?: any;

    /** Target record ID for update/delete/select operations */
    recordId?: string;

    /** Existing record data (loaded for update operations) */
    existing?: any;

    /** Database operation result (available in post-database rings) */
    result?: any;

    /** Cross-observer communication and computed values */
    metadata: Map<string, any>;

    /** Accumulated validation errors from all rings */
    errors: ValidationError[];

    /** Accumulated non-blocking warnings from all rings */
    warnings: ValidationWarning[];

    /** Start time for performance tracking */
    startTime: number;

    /** Current ring being executed (for debugging) */
    currentRing?: ObserverRing;

    /** Current observer being executed (for debugging) */
    currentObserver?: string;
}

/**
 * Base observer interface that all observers must implement
 */
export interface Observer {
    /** Which ring this observer executes in */
    ring: ObserverRing;

    /** Optional: limit to specific operations (default: all operations) */
    operations?: readonly OperationType[];

    /** Optional: observer name for debugging and error reporting */
    name?: string;

    /** Optional: timeout in milliseconds (default: 5000ms) */
    timeout?: number;

    /**
     * Public method with error handling, logging, and timeout protection
     * @param context Shared context with request data and state
     */
    executeTry(context: ObserverContext): Promise<void>;
    
    /**
     * Pure business logic method - implement this in your observer
     * @param context Shared context with request data and state
     */
    execute(context: ObserverContext): Promise<void>;
}

/**
 * Observer class constructor interface for dynamic loading
 */
export interface ObserverConstructor {
    new(): Observer;
}

/**
 * Observer execution statistics for monitoring
 */
export interface ObserverStats {
    observerName: string;
    ring: ObserverRing;
    schema: string;
    operation: OperationType;
    executionTimeMs: number;
    success: boolean;
    errorCount: number;
    warningCount: number;
}

/**
 * Observer execution summary for a complete operation
 */
export interface ObserverExecutionSummary {
    schema: string;
    operation: OperationType;
    totalTimeMs: number;
    ringsExecuted: ObserverRing[];
    observersExecuted: number;
    totalErrors: number;
    totalWarnings: number;
    success: boolean;
    stats: ObserverStats[];
}