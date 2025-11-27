import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/history/:model/:record - List all history changes for a record
 *
 * Returns all history entries for the specified record, ordered by change_id DESC.
 * Supports pagination via ?limit and ?offset query parameters.
 */
export default withTransaction(async ({ system, params, query, body }) => {
    const { model, record } = params;

    // Query history table for this model+record combination
    const result = await system.database.selectAny(
        'history',
        {
            where: {
                model_name: model,
                record_id: record
            },
            order: { change_id: 'desc' }
        }
    );

    return result;
});
