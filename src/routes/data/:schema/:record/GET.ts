import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/data/:schema/:id - Get single record by ID
 * @see docs/routes/DATA_API.md
 */
export default withParams(async (context, { system, schema, record }) => {
    const result = await system.database.select404(schema!, { where: { id: record! } });
    setRouteResult(context, result);
});
