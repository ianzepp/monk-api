import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/history/:schema/:record - List all history changes for a record
 *
 * Returns all history entries for the specified record, ordered by change_id DESC.
 * Supports pagination via ?limit and ?offset query parameters.
 */
export default withParams(async (context, { system, schema, record, options }) => {
    // Query history table for this schema+record combination
    const result = await system.database.selectAny(
        'history',
        {
            where: {
                schema_name: schema,
                record_id: record
            },
            order: { change_id: 'desc' }
        },
        options
    );

    setRouteResult(context, result);
});
