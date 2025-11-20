import { withParams, setRouteResult } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/restores/:id/cancel
 *
 * Cancel a running restore job
 */
export default withParams(async (context, { system, id }) => {
    // Find most recent running restore for this configuration
    const runningRuns = await system.database.selectAny('restore_runs', {
        where: {
            restore_id: id,
            status: { $in: ['pending', 'queued', 'running'] }
        },
        order: { created_at: 'desc' },
        limit: 1
    });

    if (runningRuns.length === 0) {
        throw HttpErrors.notFound('No running restore found for this configuration');
    }

    const run = runningRuns[0];

    // Update run status to cancelled
    await system.database.updateOne('restore_runs', run.id, {
        status: 'cancelled',
        completed_at: new Date()
    });

    // Log cancellation
    await system.database.createOne('restore_logs', {
        run_id: run.id,
        level: 'warn',
        phase: null,
        schema_name: null,
        record_id: null,
        message: 'Restore cancelled by user'
    });

    setRouteResult(context, {
        message: 'Restore cancelled',
        run_id: run.id
    });
});
