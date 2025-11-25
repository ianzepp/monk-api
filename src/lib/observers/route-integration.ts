/**
 * Observer Route Integration Helpers
 *
 * Helper functions for integrating the observer pipeline with route handlers
 */

import type { Context } from 'hono';
import type { System } from '@src/lib/system.js';
import type { OperationType, ObserverResult } from '@src/lib/observers/types.js';
import { ObserverRunner } from '@src/lib/observers/runner.js';
import { createSuccessResponse, createValidationError } from '@src/lib/api-helpers.js';

/**
 * Execute observer pipeline for a single record operation
 */
export async function executeObserverPipeline(
    system: System,
    operation: OperationType,
    modelName: string,
    data?: any,
    recordId?: string,
    existing?: any
): Promise<ObserverResult> {
    // Resolve model object - this helper needs to do its own resolution
    // since it's not going through Database.runObserverPipeline()
    const model = await system.database.toModel(modelName);

    const runner = new ObserverRunner();

    return await runner.execute(
        system,
        operation,
        model,
        data ? [data] : [], // Convert single record to array
        0 // depth
    );
}

/**
 * Execute observer pipeline for multiple records (batch operations)
 */
export async function executeObserverPipelineBatch(
    system: System,
    operation: OperationType,
    model: string,
    records: any[]
): Promise<{ success: boolean; results: any[]; errors: any[]; warnings: any[] }> {
    const results: any[] = [];
    const allErrors: any[] = [];
    const allWarnings: any[] = [];
    let successCount = 0;

    for (const [index, record] of records.entries()) {
        try {
            const result = await executeObserverPipeline(
                system,
                operation,
                model,
                record,
                record.id // For updates, the ID should be in the record
            );

            if (result.success) {
                results.push(result.result);
                successCount++;
            } else {
                // Add batch context to errors
                const batchErrors = result.errors.map(error => ({
                    ...error,
                    batch_index: index,
                    record_context: record
                }));
                allErrors.push(...batchErrors);
            }

            // Collect warnings
            if (result.warnings.length > 0) {
                const batchWarnings = result.warnings.map(warning => ({
                    ...warning,
                    batch_index: index,
                    record_context: record
                }));
                allWarnings.push(...batchWarnings);
            }

        } catch (error) {
            allErrors.push({
                message: `Batch operation failed at index ${index}: ${error}`,
                code: 'BATCH_OPERATION_ERROR',
                batch_index: index,
                record_context: record
            });
        }
    }

    return {
        success: allErrors.length === 0,
        results,
        errors: allErrors,
        warnings: allWarnings
    };
}

/**
 * Handle observer result and return appropriate HTTP response
 */
export function handleObserverResult(
    context: Context,
    result: ObserverResult,
    successStatusCode = 200
): Response {
    if (!result.success) {
        const errorMessage = result.errors.length > 0
            ? result.errors.map(e => e.message).join('; ')
            : 'Observer pipeline validation failed';

        return createValidationError(context, errorMessage, result.errors);
    }

    return createSuccessResponse(context, result.result, successStatusCode);
}

/**
 * Handle batch observer result and return appropriate HTTP response
 */
export function handleBatchObserverResult(
    context: Context,
    result: { success: boolean; results: any[]; errors: any[]; warnings: any[] },
    successStatusCode = 200
): Response {
    if (!result.success) {
        const errorMessage = result.errors.length > 0
            ? `Batch operation failed: ${result.errors.length} errors`
            : 'Batch observer pipeline validation failed';

        return createValidationError(context, errorMessage, result.errors);
    }

    return createSuccessResponse(context, result.results, successStatusCode);
}

/**
 * Load existing record for update/delete operations
 */
export async function loadExistingRecord(
    system: System,
    model: string,
    recordId: string
): Promise<any> {
    try {
        return await system.database.selectOne(model, { where: { id: recordId } });
    } catch (error) {
        throw new Error(`Failed to load existing record ${model}:${recordId}: ${error}`);
    }
}
