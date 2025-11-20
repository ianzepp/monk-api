import { withParams, setRouteResult } from '@src/lib/api-helpers.js';
import { RestoreProcessor } from '@src/lib/restore-processor.js';

/**
 * POST /api/restores/:id/run
 *
 * Execute a restore job
 */
export default withParams(async (context, { system, id }) => {
    const processor = new RestoreProcessor(system);
    const runId = await processor.execute(id!);

    setRouteResult(context, {
        run_id: runId,
        message: 'Restore queued for execution',
        status_url: `/api/data/restore_runs/${runId}`
    });
});
