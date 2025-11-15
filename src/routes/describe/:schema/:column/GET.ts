import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/describe/:schema/:column
 *
 * Retrieve column definition in Monk-native format
 *
 * @returns Column record from columns table
 */
export default withParams(async (context, { system, schema, column }) => {
    const columnDef = await system.describe.getColumn(schema!, column!);
    setRouteResult(context, columnDef);
});
