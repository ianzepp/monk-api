import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/history/:schema/:record/:change - Get specific history change
 *
 * Returns a single history entry by change_id for the specified record.
 * Returns 404 if the change_id doesn't exist for this schema+record combination.
 */
export default withParams(async (context, { system, schema, record, options }) => {
    const changeId = context.req.param('change');

    // Query history table for specific change
    const result = await system.database.select404(
        'history',
        {
            where: {
                change_id: changeId,
                schema_name: schema,
                record_id: record
            }
        },
        undefined,
        options
    );

    setRouteResult(context, result);
});
