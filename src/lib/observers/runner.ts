/**
 * Observer Runner
 *
 * Executes observers in ordered rings (0-9) with error aggregation,
 * timeout protection, and performance monitoring.
 */

import type { SystemContextWithInfrastructure } from '@src/lib/system-context-types.js';
import { Model } from '@src/lib/model.js';
import { ModelRecord } from '@src/lib/model-record.js';
import { ModelCache } from '@src/lib/model-cache.js';
import type {
    Observer,
    ObserverContext,
    ObserverStats,
    ObserverExecutionSummary
} from '@src/lib/observers/interfaces.js';
import type {
    ObserverRing,
    OperationType,
    ObserverResult
} from '@src/lib/observers/types.js';
import { RING_OPERATION_MATRIX } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import type { ValidationWarning } from '@src/lib/observers/errors.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';

/**
 * Observer execution engine with ring-based execution
 */
export class ObserverRunner {
    private readonly defaultTimeout = 5000; // 5 seconds
    private readonly collectStats = true;

    /**
     * Execute observers for a model operation with selective ring execution
     */
    async execute(
        system: SystemContextWithInfrastructure,
        operation: OperationType,
        model: Model,
        data: ModelRecord[],
        depth: number = 0,
        filter?: any
    ): Promise<ObserverResult> {
        const startTime = Date.now();

        // Model object already resolved by Database.runObserverPipeline()
        const context = this._createContext(system, operation, model, data, filter);
        const stats: ObserverStats[] = [];
        const ringsExecuted: ObserverRing[] = [];

        try {
            // Get relevant rings for this operation (selective execution)
            const relevantRings = RING_OPERATION_MATRIX[operation] || [5]; // Default: Database only

            console.info('Observer rings executing', {
                operation,
                modelName: model.model_name,
                ringCount: relevantRings.length,
                rings: relevantRings
            });

            // Execute only relevant rings for this operation
            for (const ring of relevantRings) {
                context.currentRing = ring as ObserverRing;
                ringsExecuted.push(ring as ObserverRing);

                const shouldContinue = await this._executeObserverRing(ring as ObserverRing, context, stats);
                if (!shouldContinue) {
                    break; // Stop execution due to errors
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
        system: SystemContextWithInfrastructure,
        operation: OperationType,
        model: Model,
        data: ModelRecord[],
        filter?: any
    ): ObserverContext {
        return {
            system,
            operation,
            model,
            data, // For create/update operations (now ModelRecord[])
            filter, // For select operations (rings 0-4), undefined for other operations
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
            model: context.model,
            operation: context.operation,
            totalTimeMs: totalTime,
            ringsExecuted,
            observersExecuted: stats.length,
            totalErrors: context.errors.length,
            totalWarnings: context.warnings.length,
            success,
            stats
        };

        console.info('Observer execution completed', {
            success,
            operation: context.operation,
            modelName: context.model.model_name,
            totalTimeMs: totalTime,
            ringsExecuted: ringsExecuted.length,
            observersExecuted: stats.length,
            errorCount: context.errors.length,
            warningCount: context.warnings.length
        });

        return {
            success,
            errors: context.errors,
            warnings: context.warnings
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
        console.warn('Observer execution failed', {
            operation: context.operation,
            modelName: context.model.model_name,
            totalTimeMs: totalTime,
            error: error instanceof Error ? error.message : String(error)
        });

        return {
            success: false,
            errors: [{
                message: `Observer execution failed: ${error}`,
                code: 'OBSERVER_EXECUTION_ERROR'
            }],
            warnings: context.warnings
        };
    }


    /**
     * Execute observers for a specific ring
     */
    private async _executeObserverRing(
        ring: ObserverRing,
        context: ObserverContext,
        stats: ObserverStats[]
    ): Promise<boolean> {
        const observers = ObserverLoader.getObservers(context.model.model_name, ring);

        // Sort observers by priority (lower numbers execute first)
        // This ensures deterministic execution order within a ring
        const sortedObservers = observers.sort((a, b) => {
            const priorityA = a.priority ?? 50; // Default to 50 if not specified
            const priorityB = b.priority ?? 50;
            return priorityA - priorityB;
        });

        for (const observer of sortedObservers) {
            if (this._shouldExecuteObserver(observer, context)) {
                const observerStats = await this._executeObserver(observer, context);
                if (this.collectStats) {
                    stats.push(observerStats);
                }
            }
        }

        // Check for errors after each pre-database ring
        if (context.errors.length > 0 && ring < 5) {
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
            model: context.model.model_name,
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
            context.model &&
            context.errors &&
            context.warnings &&
            typeof context.startTime === 'number'
        );
    }

}
