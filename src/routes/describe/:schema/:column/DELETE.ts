import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * DELETE /api/describe/:schema/:column
 *
 * Delete a column from the schema
 *
 * @returns Deletion confirmation
 */
export default withTransactionParams(async (context, { system, schema, column }) => {
    // Delete column using Describe API
    const result = await system.describe.deleteColumn(schema!, column!);

    setRouteResult(context, result);
});
