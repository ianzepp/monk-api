/**
 * Transaction Runner
 *
 * Core transaction lifecycle management, decoupled from any HTTP framework.
 * Provides a single source of truth for transaction handling that can be
 * used by route handlers, app packages, background jobs, and CLI tools.
 */

import { System, type SystemInit } from '@src/lib/system.js';
import { createAdapter } from '@src/lib/database/index.js';

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
    /** Skip namespace cache loading (useful for bootstrap operations) */
    skipCacheLoad?: boolean;
    /** Custom logging context for debugging */
    logContext?: Record<string, any>;
}

/**
 * Result wrapper that includes the System instance for post-transaction access
 */
export interface TransactionResult<T> {
    result: T;
    system: System;
}

/**
 * Core transaction runner - framework-agnostic
 *
 * Handles the complete transaction lifecycle:
 * 1. Creates System from SystemInit
 * 2. Creates and connects database adapter
 * 3. Begins transaction
 * 4. Loads namespace cache (unless skipped)
 * 5. Executes handler
 * 6. Commits on success, rolls back on error
 * 7. Cleans up adapter connection
 *
 * @param init - System initialization parameters (from JWT or direct)
 * @param handler - Async function to execute within the transaction
 * @param options - Optional configuration
 * @returns The result of the handler function
 * @throws Re-throws any error from handler after rollback
 *
 * @example
 * // Direct usage for app/job contexts
 * const result = await runTransaction(systemInit, async (system) => {
 *     return await system.database.selectOne('users', userId);
 * });
 *
 * @example
 * // With options
 * await runTransaction(systemInit, async (system) => {
 *     await system.describe.models.createOne({ model_name: 'foo' });
 * }, { skipCacheLoad: true });
 */
export async function runTransaction<T>(
    init: SystemInit,
    handler: (system: System) => Promise<T>,
    options: TransactionOptions = {}
): Promise<T> {
    const system = new System(init);
    const adapter = createAdapter({
        dbType: init.dbType,
        db: init.dbName,
        ns: init.nsName,
    });

    const logContext = {
        dbType: init.dbType,
        namespace: init.nsName,
        tenant: init.tenant,
        ...options.logContext,
    };

    try {
        // Connect and begin transaction
        await adapter.connect();
        await adapter.beginTransaction();

        // Set adapter on system for database operations
        system.adapter = adapter;

        // Load namespace cache if needed (most operations need this)
        if (!options.skipCacheLoad && system.namespace && !system.namespace.isLoaded()) {
            await system.namespace.loadAll(system);
        }

        console.info('Transaction started', {
            ...logContext,
            cacheLoaded: system.namespace?.isLoaded() ?? false,
        });

        // Execute handler within transaction
        const result = await handler(system);

        // Commit on success
        await adapter.commit();
        console.info('Transaction committed', logContext);

        return result;

    } catch (error) {
        // Rollback on any error
        try {
            await adapter.rollback();
            console.info('Transaction rolled back', {
                ...logContext,
                error: error instanceof Error ? error.message : String(error),
            });
        } catch (rollbackError) {
            console.warn('Failed to rollback transaction', {
                ...logContext,
                rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
            });
        }

        // Re-throw original error for caller to handle
        throw error;

    } finally {
        // Always clean up
        await adapter.disconnect();
        system.adapter = null;
    }
}

/**
 * Run transaction and return both result and system instance
 *
 * Useful when caller needs access to system state after transaction completes
 * (e.g., for reading correlationId or other metadata).
 *
 * @param init - System initialization parameters
 * @param handler - Async function to execute within the transaction
 * @param options - Optional configuration
 * @returns Object containing both the result and the system instance
 */
export async function runTransactionWithSystem<T>(
    init: SystemInit,
    handler: (system: System) => Promise<T>,
    options: TransactionOptions = {}
): Promise<TransactionResult<T>> {
    let capturedSystem: System | null = null;

    const result = await runTransaction(init, async (system) => {
        capturedSystem = system;
        return await handler(system);
    }, options);

    return {
        result,
        system: capturedSystem!,
    };
}
