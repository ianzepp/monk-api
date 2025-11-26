import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { fireAndForget } from '@src/lib/internal-api.js';

/**
 * POST /api/extracts/:record/run
 *
 * Queue an extract job for execution.
 * Creates an extract_run record in 'queued' state, then fires off
 * an internal request to /execute which runs synchronously with full
 * JWT context.
 *
 * @returns Extract run ID immediately (execution happens in background)
 */
export default withTransactionParams(async (context, { system, record: extractId }) => {
    if (!extractId) {
        throw HttpErrors.badRequest('Extract ID required');
    }

    // Get extract configuration
    const extract = await system.database.select404(
        'extracts',
        { where: { id: extractId } },
        'Extract not found'
    );

    // Validate extract is enabled
    if (!extract.enabled) {
        throw HttpErrors.conflict('Extract is disabled');
    }

    // Check if already running
    const runningRuns = await system.database.selectAny('extract_runs', {
        where: {
            extract_id: extractId,
            status: { $in: ['pending', 'queued', 'running'] }
        }
    });

    if (runningRuns.length > 0) {
        throw HttpErrors.conflict('Extract is already running');
    }

    // Create extract_run record
    const run = await system.database.createOne('extract_runs', {
        extract_id: extractId,
        extract_name: extract.name,
        status: 'queued',
        progress: 0,
        triggered_by: 'manual',
        executed_by: system.userId,
        config_snapshot: {
            format: extract.format,
            include: extract.include,
            models: extract.models,
            compress: extract.compress,
            split_files: extract.split_files
        }
    });

    // Update extract stats
    await system.database.updateOne('extracts', extractId, {
        last_run_id: run.id,
        last_run_status: 'queued',
        last_run_at: new Date(),
        total_runs: (extract.total_runs || 0) + 1
    });

    // Fire-and-forget: kick off the actual execution with full JWT context
    // The /execute endpoint runs synchronously but we don't wait for it
    const token = context.req.header('Authorization') || '';
    fireAndForget(
        'POST',
        `/api/extracts/${run.id}/execute`,
        token,
        undefined,
        { runId: run.id, extractId, operation: 'extract' }
    );

    setRouteResult(context, {
        run_id: run.id,
        message: 'Extract queued for execution',
        status_url: `/api/data/extract_runs/${run.id}`
    });
});
