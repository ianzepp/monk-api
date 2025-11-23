import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/restores/:record/cancel
 *
 * Cancel a running restore job
 */
export default withParams(async (context, { system, record }) => {
    // Find most recent running restore for this configuration
    const runningRuns = await system.database.selectAny('restore_runs', {
        where: {
            restore_id: record,
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
        model_name: null,
        record_id: null,
        message: 'Restore cancelled by user'
    });

    setRouteResult(context, {
        message: 'Restore cancelled',
        run_id: run.id
    });
});
