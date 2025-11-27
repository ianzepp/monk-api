import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/history/:model/:record/:change - Get specific history change
 *
 * Returns a single history entry by change_id for the specified record.
 * Returns 404 if the change_id doesn't exist for this model+record combination.
 */
export default withTransaction(async ({ system, params, query, body }) => {
    const { model, record, change } = params;

    // Query history table for specific change
    const result = await system.database.select404(
        'history',
        {
            where: {
                change_id: change,
                model_name: model,
                record_id: record
            }
        }
    );

    return result;
});
