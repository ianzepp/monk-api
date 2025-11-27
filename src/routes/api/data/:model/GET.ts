import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/data/:model - List all records in model
 *
 * Supports query parameters:
 * - ?where={json} - Filter criteria (JSON-encoded object)
 *
 * For count operations, use POST /api/aggregate/:model with:
 *   {"aggregate": {"count": {"$count": "*"}}}
 *
 * @see docs/routes/DATA_API.md
 */
export default withTransaction(async ({ system, params, query }) => {
    const { model } = params;

    // Parse optional where filter from query parameter
    const whereParam = query.where;
    const filterData = whereParam ? { where: JSON.parse(whereParam) } : {};

    return await system.database.selectAny(model, filterData, {
        context: 'api' as const,
    });
});
