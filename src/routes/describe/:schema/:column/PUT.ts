import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * PUT /api/describe/:schema/:column
 *
 * Update an existing column in Monk-native format
 *
 * Request body: Column definition updates in Monk format
 * @returns Updated column record from columns table
 */
export default withTransactionParams(async (context, { system, schema, column, body }) => {
    // Update column using Describe API
    const result = await system.describe.updateColumn(schema!, column!, body);

    setRouteResult(context, result);
});
