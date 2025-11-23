import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/data/:model - List all records in model
 * @see docs/routes/DATA_API.md
 */
export default withParams(async (context, { system, model, options }) => {
    const result = await system.database.selectAny(model!, {}, options);
    setRouteResult(context, result);
});
