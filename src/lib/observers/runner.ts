/**
 * Observer Runner
 * 
 * Executes observers in ordered rings (0-9) with error aggregation,
 * timeout protection, and performance monitoring.
 */

import type { System } from '../system.js';
import type { 
    Observer, 
    ObserverContext, 
    ObserverStats, 
    ObserverExecutionSummary 
} from './interfaces.js';
import type { 
    ObserverRing, 
    OperationType, 
    ObserverResult, 
    ValidationError, 
    ValidationWarning
} from './types.js';
import { DATABASE_RING } from './types.js';
import { ObserverLoader } from './loader.js';

/**
 * Observer execution engine with ring-based execution
 */
export class ObserverRunner {
    private readonly defaultTimeout = 5000; // 5 seconds
    private readonly collectStats = true;

    /**
     * Execute all observers for a schema operation across all rings
     */
    async execute(
        system: System,
        operation: OperationType,
        schema: string,
        data?: any,
        recordId?: string,
        existing?: any
    ): Promise<ObserverResult> {
        const startTime = Date.now();
        
        // Create shared observer context
        const context: ObserverContext = {
            system,
            operation,
            schema,
            data,
            recordId,
            existing,
            result: undefined,
            metadata: new Map(),
            errors: [],
            warnings: [],
            startTime,
            currentRing: undefined,
            currentObserver: undefined
        };

        const stats: ObserverStats[] = [];
        const ringsExecuted: ObserverRing[] = [];

        try {
            // Execute rings 0-9 in order
            for (let ring = 0; ring <= 9; ring++) {
                context.currentRing = ring as ObserverRing;
                ringsExecuted.push(ring as ObserverRing);

                if (ring === DATABASE_RING) {
                    // DATABASE RING (5): Placeholder for actual database operation
                    // This will be implemented in Phase 3
                    console.debug(`🎯 DATABASE RING (${ring}): Placeholder - no database integration yet`);
                    context.result = { placeholder: true, operation, schema, data, recordId };
                } else {
                    // Execute observers for this ring
                    const observers = ObserverLoader.getObservers(schema, ring as ObserverRing);
                    
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
                        console.debug(`🛑 Stopping execution due to ${context.errors.length} errors in ring ${ring}`);
                        break;
                    }
                }
            }

            const totalTime = Date.now() - startTime;
            const success = context.errors.length === 0;

            // Create execution summary
            const summary: ObserverExecutionSummary = {
                schema,
                operation,
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

        } catch (error) {
            const totalTime = Date.now() - startTime;
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
                observer.execute(context),
                this._createTimeoutPromise(timeout, observer.name || 'unnamed')
            ]);

            console.debug(`✅ Observer executed: ${observer.name} (ring ${observer.ring})`);

        } catch (error) {
            success = false;
            errorCount++;
            
            const validationError: ValidationError = {
                message: `Observer execution failed: ${error}`,
                code: 'OBSERVER_ERROR',
                ring: observer.ring,
                observer: observer.name
            };
            context.errors.push(validationError);

            console.warn(`❌ Observer failed: ${observer.name}`, error);
        }

        // Count errors/warnings added by this observer
        const currentErrors = context.errors.filter(e => e.observer === observer.name).length;
        const currentWarnings = context.warnings.filter(w => w.observer === observer.name).length;
        
        errorCount = Math.max(errorCount, currentErrors);
        warningCount = currentWarnings;

        const executionTime = Date.now() - startTime;

        return {
            observerName: observer.name || 'unnamed',
            ring: observer.ring,
            schema: context.schema,
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
}