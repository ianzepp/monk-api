import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { RestoreProcessor } from '@src/lib/restore-processor.js';

/**
 * POST /api/restores/:record/run
 *
 * Execute a restore job
 */
export default withTransactionParams(async (context, { system, record }) => {
    const processor = new RestoreProcessor(system);
    const runId = await processor.execute(record!);

    setRouteResult(context, {
        run_id: runId,
        message: 'Restore queued for execution',
        status_url: `/api/data/restore_runs/${runId}`
    });
});
