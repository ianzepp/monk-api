/**
 * Observer Route Integration Helpers
 * 
 * Helper functions for integrating the observer pipeline with route handlers
 */

import type { Context } from 'hono';
import type { System } from '@lib/system.js';
import type { OperationType, ObserverResult } from '@observers/types.js';
import { ObserverRunner } from '@observers/runner.js';
import { createSuccessResponse, createValidationError } from '@lib/api/responses.js';

/**
 * Execute observer pipeline for a single record operation
 */
export async function executeObserverPipeline(
    system: System,
    operation: OperationType,
    schema: string,
    data?: any,
    recordId?: string,
    existing?: any
): Promise<ObserverResult> {
    const runner = new ObserverRunner();
    
    return await runner.execute(
        system,
        operation,
        schema,
        data,
        recordId,
        existing
    );
}

/**
 * Execute observer pipeline for multiple records (batch operations)
 */
export async function executeObserverPipelineBatch(
    system: System,
    operation: OperationType,
    schema: string,
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
                schema,
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
    schema: string,
    recordId: string
): Promise<any> {
    try {
        return await system.database.selectOne(schema, { where: { id: recordId } });
    } catch (error) {
        throw new Error(`Failed to load existing record ${schema}:${recordId}: ${error}`);
    }
}