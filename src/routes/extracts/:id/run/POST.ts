import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { ExtractProcessor } from '@src/lib/extract-processor.js';

/**
 * POST /api/extracts/:id/run
 *
 * Execute an extract job
 * Creates an extract_run record and starts background processing
 *
 * @returns Extract run ID
 */
export default withParams(async (context, { system, id }) => {
    const processor = new ExtractProcessor(system);
    const runId = await processor.execute(id!);

    setRouteResult(context, {
        run_id: runId,
        message: 'Extract queued for execution',
        status_url: `/api/data/extract_runs/${runId}`
    });
});
