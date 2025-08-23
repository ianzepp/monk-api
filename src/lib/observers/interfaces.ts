/**
 * Observer Framework Interfaces
 * 
 * Core interfaces for the observer ring system including context sharing,
 * observer definitions, and execution contracts.
 */

import type { System } from '../system.js';
import type { 
    ObserverRing, 
    OperationType, 
    ValidationError, 
    ValidationWarning, 
    ObserverResult 
} from './types.js';

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
    schema: string;

    /** Input data for create/update operations */
    data?: any;

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
    operations?: readonly OperationType[] | OperationType[];

    /** Optional: observer name for debugging and error reporting */
    name?: string;

    /** Optional: timeout in milliseconds (default: 5000ms) */
    timeout?: number;

    /**
     * Execute the observer logic
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