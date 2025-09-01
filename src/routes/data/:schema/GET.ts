import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/data/:schema - List all records in schema
 * @see docs/routes/DATA_API.md
 */
export default withParams(async (context, { system, schema }) => {
    const result = await system.database.selectAny(schema!, {}, { context: 'api' });
    setRouteResult(context, result);
});
