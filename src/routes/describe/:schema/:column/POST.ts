import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * POST /api/describe/:schema/:column
 *
 * Create a new column in Monk-native format
 *
 * Request body: Column definition in Monk format (type, required, etc.)
 * @returns Created column record from columns table
 */
export default withTransactionParams(async (context, { system, schema, column, body }) => {
    // Create column using Describe API
    const result = await system.describe.createColumn(schema!, column!, body);

    setRouteResult(context, result);
});
