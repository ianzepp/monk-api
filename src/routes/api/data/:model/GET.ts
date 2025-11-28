import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/data/:model - List all records in model
 *
 * For filtered queries, use POST /api/find/:model
 * For count operations, use POST /api/aggregate/:model
 *
 * @see docs/routes/DATA_API.md
 */
export default withTransaction(async ({ system, params }) => {
    const { model } = params;
    return await system.database.selectAny(model);
});
