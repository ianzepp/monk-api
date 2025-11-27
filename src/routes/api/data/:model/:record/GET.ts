import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';

/**
 * GET /api/data/:model/:id - Get single record by ID
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, options }) => {
    const result = await system.database.select404(model!, { where: { id: record! } }, undefined, options);
    setRouteResult(context, result);
});
