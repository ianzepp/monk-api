import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/history/:model/:record - List all history changes for a record
 *
 * Returns all history entries for the specified record, ordered by change_id DESC.
 * Supports pagination via ?limit and ?offset query parameters.
 */
export default withTransactionParams(async (context, { system, model, record, options }) => {
    // Query history table for this model+record combination
    const result = await system.database.selectAny(
        'history',
        {
            where: {
                model_name: model,
                record_id: record
            },
            order: { change_id: 'desc' }
        },
        options
    );

    setRouteResult(context, result);
});
