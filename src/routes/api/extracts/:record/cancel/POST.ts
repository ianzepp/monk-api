import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/extracts/:record/cancel
 *
 * Cancel a running extract job
 *
 * TODO: Implement cancellation logic
 * For now, returns not implemented
 */
export default withTransactionParams(async (context, { system, record }) => {
    // Find running extract for this extract ID
    const runningRuns = await system.database.selectAny('extract_runs', {
        where: {
            extract_id: record,
            status: { $in: ['pending', 'queued', 'running'] }
        },
        order: { created_at: 'desc' },
        limit: 1
    });

    if (runningRuns.length === 0) {
        throw HttpErrors.notFound('No running extract found');
    }

    // TODO: Implement actual cancellation
    // For now, just mark as cancelled
    const run = runningRuns[0];
    await system.database.updateOne('extract_runs', run.id, {
        status: 'cancelled',
        completed_at: new Date()
    });

    setRouteResult(context, {
        message: 'Extract cancelled',
        run_id: run.id
    });
});
