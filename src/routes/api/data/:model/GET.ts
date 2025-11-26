import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

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
export default withTransactionParams(async (context, { system, model, options }) => {
    // Parse optional where filter from query parameter
    const whereParam = context.req.query('where');
    const filterData = whereParam ? { where: JSON.parse(whereParam) } : {};

    const result = await system.database.selectAny(model!, filterData, options);
    setRouteResult(context, result);
});
