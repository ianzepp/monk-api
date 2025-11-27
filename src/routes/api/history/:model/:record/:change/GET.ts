import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';

/**
 * GET /api/history/:model/:record/:change - Get specific history change
 *
 * Returns a single history entry by change_id for the specified record.
 * Returns 404 if the change_id doesn't exist for this model+record combination.
 */
export default withTransactionParams(async (context, { system, model, record, options }) => {
    const changeId = context.req.param('change');

    // Query history table for specific change
    const result = await system.database.select404(
        'history',
        {
            where: {
                change_id: changeId,
                model_name: model,
                record_id: record
            }
        },
        undefined,
        options
    );

    setRouteResult(context, result);
});
