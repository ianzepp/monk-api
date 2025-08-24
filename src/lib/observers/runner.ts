/**
 * Observer Runner
 * 
 * Executes observers in ordered rings (0-9) with error aggregation,
 * timeout protection, and performance monitoring.
 */

import type { System } from '@lib/system.js';
import { Schema, type SchemaName } from '@lib/schema.js';
import { SchemaCache } from '@lib/schema-cache.js';
import type { 
    Observer, 
    ObserverContext, 
    ObserverStats, 
    ObserverExecutionSummary 
} from './interfaces.js';
import type { 
    ObserverRing, 
    OperationType, 
    ObserverResult
} from './types.js';
import { RING_OPERATION_MATRIX } from './types.js';
import { ValidationError } from './errors.js';
import type { ValidationWarning } from './errors.js';
import { DATABASE_RING } from './types.js';
import { ObserverLoader } from './loader.js';
import { SqlObserver } from './sql-observer.js';

/**
 * Observer execution engine with ring-based execution
 */
export class ObserverRunner {
    private readonly defaultTimeout = 5000; // 5 seconds
    private readonly collectStats = true;
    private readonly sqlObserver = new SqlObserver();

    /**
     * Execute observers for a schema operation with selective ring execution
     */
    async execute(
        system: System,
        operation: OperationType,
        schemaName: string,
        data: any[],
        existing?: any[],
        depth: number = 0,
        filter?: any
    ): Promise<ObserverResult> {
        const startTime = Date.now();
        
        // Load Schema object before creating context (moved from Database.toSchema)
        const schemaObj = await this.loadSchemaObject(system, schemaName);
        
        const context = this._createContext(system, operation, schemaName, schemaObj, data, existing, filter);
        const stats: ObserverStats[] = [];
        const ringsExecuted: ObserverRing[] = [];

        try {
            // Get relevant rings for this operation (selective execution)
            const relevantRings = RING_OPERATION_MATRIX[operation] || [5]; // Default: Database only
            
            console.debug(`🎯 Executing ${relevantRings.length} relevant rings for ${operation}: [${relevantRings.join(', ')}]`);
            
            // Execute only relevant rings for this operation
            for (const ring of relevantRings) {
                context.currentRing = ring as ObserverRing;
                ringsExecuted.push(ring as ObserverRing);

                if (ring === DATABASE_RING) {
                    await this._executeDatabaseRing(context, stats);
                } else {
                    const shouldContinue = await this._executeObserverRing(ring as ObserverRing, context, stats);
                    if (!shouldContinue) {
                        break; // Stop execution due to errors
                    }
                }
            }

            const totalTime = Date.now() - startTime;
            return this._createSuccessResult(context, stats, ringsExecuted, totalTime);

        } catch (error) {
            const totalTime = Date.now() - startTime;
            return this._createErrorResult(context, error, totalTime);
        }
    }

    /**
     * Create observer context for execution
     */
    private _createContext(
        system: System,
        operation: OperationType,
        schemaName: string,
        schema: Schema,
        data: any[],
        existing?: any[],
        filter?: any
    ): ObserverContext {
        return {
            system,
            operation,
            schemaName,
            schema,
            data, // For create/update operations, or populated by ring 5 for select
            filter, // For select operations (rings 0-4), undefined for other operations
            existing, // For update operations
            result: undefined,
            metadata: new Map(),
            errors: [],
            warnings: [],
            startTime: Date.now(),
            currentRing: undefined,
            currentObserver: undefined
        };
    }

    /**
     * Create successful execution result
     */
    private _createSuccessResult(
        context: ObserverContext,
        stats: ObserverStats[],
        ringsExecuted: ObserverRing[],
        totalTime: number
    ): ObserverResult {
        const success = context.errors.length === 0;
        
        // Create execution summary for debugging
        const summary = {
            schema: context.schema,
            operation: context.operation,
            totalTimeMs: totalTime,
            ringsExecuted,
            observersExecuted: stats.length,
            totalErrors: context.errors.length,
            totalWarnings: context.warnings.length,
            success,
            stats
        };

        console.debug(`🏁 Observer execution complete: ${success ? 'SUCCESS' : 'FAILED'} (${totalTime}ms)`);

        return {
            success,
            result: context.result,
            errors: context.errors,
            warnings: context.warnings,
            metadata: context.metadata
        };
    }

    /**
     * Create error result for execution failures
     */
    private _createErrorResult(
        context: ObserverContext,
        error: unknown,
        totalTime: number
    ): ObserverResult {
        console.error('❌ Observer execution failed:', error);
        
        return {
            success: false,
            result: undefined,
            errors: [{
                message: `Observer execution failed: ${error}`,
                code: 'OBSERVER_EXECUTION_ERROR'
            }],
            warnings: context.warnings,
            metadata: context.metadata
        };
    }

    /**
     * Execute database ring (Ring 5) - handles actual SQL execution
     */
    private async _executeDatabaseRing(
        context: ObserverContext, 
        stats: ObserverStats[]
    ): Promise<void> {
        console.debug(`🎯 DATABASE RING (${DATABASE_RING}): Executing SQL operation`);
        
        const dbStats = await this._executeObserver(this.sqlObserver, context);
        if (this.collectStats) {
            stats.push(dbStats);
        }
    }

    /**
     * Execute observers for a specific ring
     */
    private async _executeObserverRing(
        ring: ObserverRing, 
        context: ObserverContext, 
        stats: ObserverStats[]
    ): Promise<boolean> {
        const observers = ObserverLoader.getObservers(context.schemaName, ring);
        
        for (const observer of observers) {
            if (this._shouldExecuteObserver(observer, context)) {
                const observerStats = await this._executeObserver(observer, context);
                if (this.collectStats) {
                    stats.push(observerStats);
                }
            }
        }

        // Check for errors after each pre-database ring
        if (context.errors.length > 0 && ring < DATABASE_RING) {
            // Keep as debug - detailed execution flow for development
            return false; // Stop execution
        }
        
        return true; // Continue execution
    }

    /**
     * Execute a single observer with timeout protection
     */
    private async _executeObserver(
        observer: Observer, 
        context: ObserverContext
    ): Promise<ObserverStats> {
        const startTime = Date.now();
        context.currentObserver = observer.name || 'unnamed';
        
        const timeout = observer.timeout || this.defaultTimeout;
        let success = true;
        let errorCount = 0;
        let warningCount = 0;

        try {
            // Execute observer with timeout protection
            await Promise.race([
                observer.executeTry(context),
                this._createTimeoutPromise(timeout, observer.name || 'unnamed')
            ]);

            console.debug(`✅ Observer executed: ${observer.name} (ring ${observer.ring})`);

        } catch (error) {
            success = false;
            errorCount++;
            
            const validationError = new ValidationError(
                `Observer execution failed: ${error}`,
                undefined,
                'OBSERVER_ERROR'
            );
            context.errors.push(validationError);

            // Note: Observer errors should be handled by BaseObserver.executeTry()
            // This is a fallback that shouldn't normally execute
        }

        // Count errors/warnings added by this observer
        const currentErrors = context.errors.length;
        const currentWarnings = context.warnings.length;
        
        errorCount = Math.max(errorCount, currentErrors);
        warningCount = currentWarnings;

        const executionTime = Date.now() - startTime;

        return {
            observerName: observer.name || 'unnamed',
            ring: observer.ring,
            schema: context.schemaName,
            operation: context.operation,
            executionTimeMs: executionTime,
            success,
            errorCount,
            warningCount
        };
    }

    /**
     * Check if observer should be executed for this context
     */
    private _shouldExecuteObserver(observer: Observer, context: ObserverContext): boolean {
        // Check operation targeting
        if (observer.operations && observer.operations.length > 0) {
            if (!observer.operations.includes(context.operation)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Create timeout promise that rejects after specified milliseconds
     */
    private _createTimeoutPromise(timeoutMs: number, observerName: string): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Observer timeout (${timeoutMs}ms): ${observerName}`));
            }, timeoutMs);
        });
    }

    /**
     * Validate observer execution context
     */
    static validateContext(context: Partial<ObserverContext>): context is ObserverContext {
        return !!(
            context.system &&
            context.operation &&
            context.schema &&
            context.metadata &&
            context.errors &&
            context.warnings &&
            typeof context.startTime === 'number'
        );
    }

    /**
     * Load Schema object from SchemaCache (moved from Database.toSchema)
     */
    private async loadSchemaObject(system: System, schemaName: string): Promise<Schema> {
        console.debug(`ObserverRunner: Loading schema '${schemaName}'`);
        
        const schemaCache = SchemaCache.getInstance();
        const schemaRecord = await schemaCache.getSchema(system, schemaName);
        
        // Create Schema instance with validation capabilities
        const schema = new Schema(system, schemaName, schemaRecord);
        console.debug(`ObserverRunner: Schema '${schemaName}' loaded`);
        
        return schema;
    }
}