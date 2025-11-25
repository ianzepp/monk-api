import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { fireAndForget } from '@src/lib/internal-api.js';

/**
 * POST /api/restores/:record/run
 *
 * Queue a restore job for execution.
 * Creates a restore_run record in 'queued' state, then fires off
 * an internal request to /execute which runs synchronously with full
 * JWT context.
 *
 * @returns Restore run ID immediately (execution happens in background)
 */
export default withTransactionParams(async (context, { system, record: restoreId }) => {
    if (!restoreId) {
        throw HttpErrors.badRequest('Restore ID required');
    }

    // Get restore configuration
    const restore = await system.database.select404(
        'restores',
        { where: { id: restoreId } },
        'Restore not found'
    );

    // Validate restore is enabled
    if (!restore.enabled) {
        throw HttpErrors.conflict('Restore is disabled');
    }

    // Validate source exists
    if (!restore.source_ref) {
        throw HttpErrors.badRequest('No source file specified');
    }

    // Check if already running
    const runningRuns = await system.database.selectAny('restore_runs', {
        where: {
            restore_id: restoreId,
            status: { $in: ['pending', 'queued', 'running'] }
        }
    });

    if (runningRuns.length > 0) {
        throw HttpErrors.conflict('Restore is already running');
    }

    // Create restore_run record
    const run = await system.database.createOne('restore_runs', {
        restore_id: restoreId,
        restore_name: restore.name,
        source_filename: restore.source_ref,
        status: 'queued',
        progress: 0,
        config_snapshot: {
            source_type: restore.source_type,
            conflict_strategy: restore.conflict_strategy,
            include: restore.include,
            models: restore.models,
            create_models: restore.create_models
        }
    });

    // Update restore stats
    await system.database.updateOne('restores', restoreId, {
        last_run_id: run.id,
        last_run_at: new Date(),
        total_runs: (restore.total_runs || 0) + 1
    });

    // Fire-and-forget: kick off the actual execution with full JWT context
    // The /execute endpoint runs synchronously but we don't wait for it
    const token = context.req.header('Authorization') || '';
    fireAndForget(
        'POST',
        `/api/restores/${run.id}/execute`,
        token,
        undefined,
        { runId: run.id, restoreId, operation: 'restore' }
    );

    setRouteResult(context, {
        run_id: run.id,
        message: 'Restore queued for execution',
        status_url: `/api/data/restore_runs/${run.id}`
    });
});
