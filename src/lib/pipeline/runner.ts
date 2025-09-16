/**
 * Pipeline Runner
 *
 * Executes observers in ordered rings (0-9) with error aggregation,
 * timeout protection, and performance monitoring.
 */

import type { System } from '@src/lib/system.js';
import { Schema, type SchemaName } from '@src/lib/schema.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
import { Logger } from '@src/lib/logger.js';
import type {
    Pipeline,
    PipelineContext,
    PipelineStats,
    PipelineExecutionSummary
} from '@src/lib/pipeline/interfaces.js';
import type {
    PipelineRing,
    OperationType,
    PipelineResult
} from '@src/lib/pipeline/types.js';
import { RING_OPERATION_MATRIX } from '@src/lib/pipeline/types.js';
import { ValidationError } from '@src/lib/pipeline/errors.js';
import type { ValidationWarning } from '@src/lib/pipeline/errors.js';
import { PipelineLoader } from '@src/lib/pipeline/loader.js';

/**
 * Pipeline execution engine with ring-based execution
 */
export class PipelineRunner {
    private readonly defaultTimeout = 5000; // 5 seconds
    private readonly collectStats = true;

    /**
     * Execute observers for a schema operation with selective ring execution
     */
    async execute(
        system: System,
        operation: OperationType,
        schema: Schema,
        data: any[],
        existing?: any[],
        depth: number = 0,
        filter?: any
    ): Promise<PipelineResult> {
        const startTime = Date.now();

        // Schema object already resolved by Database.runPipelinePipeline()
        const schemaName = schema.name;

        const context = this._createContext(system, operation, schemaName, schema, data, existing, filter);
        const stats: PipelineStats[] = [];
        const ringsExecuted: PipelineRing[] = [];

        try {
            // Get relevant rings for this operation (selective execution)
            const relevantRings = RING_OPERATION_MATRIX[operation] || [5]; // Default: Database only

            logger.info('Pipeline rings executing', {
                operation,
                schemaName: schema.name,
                ringCount: relevantRings.length,
                rings: relevantRings
            });

            // Execute only relevant rings for this operation
            for (const ring of relevantRings) {
                context.currentRing = ring as PipelineRing;
                ringsExecuted.push(ring as PipelineRing);

                const shouldContinue = await this._executePipelineRing(ring as PipelineRing, context, stats);
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
        system: System,
        operation: OperationType,
        schemaName: string,
        schema: Schema,
        data: any[],
        existing?: any[],
        filter?: any
    ): PipelineContext {
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
            currentPipeline: undefined
        };
    }

    /**
     * Create successful execution result
     */
    private _createSuccessResult(
        context: PipelineContext,
        stats: PipelineStats[],
        ringsExecuted: PipelineRing[],
        totalTime: number
    ): PipelineResult {
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

        logger.info('Pipeline execution completed', {
            success,
            operation: context.operation,
            schemaName: context.schema.name,
            totalTimeMs: totalTime,
            ringsExecuted: ringsExecuted.length,
            observersExecuted: stats.length,
            errorCount: context.errors.length,
            warningCount: context.warnings.length
        });

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
        context: PipelineContext,
        error: unknown,
        totalTime: number
    ): PipelineResult {
        logger.warn('Pipeline execution failed', {
            operation: context.operation,
            schemaName: context.schema.name,
            totalTimeMs: totalTime,
            error: error instanceof Error ? error.message : String(error)
        });

        return {
            success: false,
            result: undefined,
            errors: [{
                message: `Pipeline execution failed: ${error}`,
                code: 'OBSERVER_EXECUTION_ERROR'
            }],
            warnings: context.warnings,
            metadata: context.metadata
        };
    }


    /**
     * Execute observers for a specific ring
     */
    private async _executePipelineRing(
        ring: PipelineRing,
        context: PipelineContext,
        stats: PipelineStats[]
    ): Promise<boolean> {
        const observers = PipelineLoader.getPipelines(context.schemaName, ring);

        for (const observer of observers) {
            if (this._shouldExecutePipeline(observer, context)) {
                const observerStats = await this._executePipeline(observer, context);
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
    private async _executePipeline(
        pipeline: Pipeline,
        context: PipelineContext
    ): Promise<PipelineStats> {
        const startTime = Date.now();
        context.currentPipeline = pipeline.name || 'unnamed';

        const timeout = pipeline.timeout || this.defaultTimeout;
        let success = true;
        let errorCount = 0;
        let warningCount = 0;

        try {
            // Execute observer with timeout protection
            await Promise.race([
                pipeline.executeTry(context),
                this._createTimeoutPromise(timeout, pipeline.name || 'unnamed')
            ]);

        } catch (error) {
            success = false;
            errorCount++;

            const validationError = new ValidationError(
                `Pipeline execution failed: ${error}`,
                undefined,
                'OBSERVER_ERROR'
            );
            context.errors.push(validationError);

            // Note: Pipeline errors should be handled by BaseObserver.executeTry()
            // This is a fallback that shouldn't normally execute
        }

        // Count errors/warnings added by this observer
        const currentErrors = context.errors.length;
        const currentWarnings = context.warnings.length;

        errorCount = Math.max(errorCount, currentErrors);
        warningCount = currentWarnings;

        const executionTime = Date.now() - startTime;

        return {
            observerName: pipeline.name || 'unnamed',
            ring: pipeline.ring,
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
    private _shouldExecutePipeline(pipeline: Pipeline, context: PipelineContext): boolean {
        // Check operation targeting
        if (pipeline.operations && pipeline.operations.length > 0) {
            if (!pipeline.operations.includes(context.operation)) {
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
                reject(new Error(`Pipeline timeout (${timeoutMs}ms): ${observerName}`));
            }, timeoutMs);
        });
    }

    /**
     * Validate observer execution context
     */
    static validateContext(context: Partial<PipelineContext>): context is PipelineContext {
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
