import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * POST /api/describe/:schema/:column
 *
 * Create a new column in Monk-native format
 *
 * Request body: Column definition in Monk format (type, required, etc.)
 * @returns Created column record from columns table
 */
export default withTransactionParams(async (context, { system, schema, column, body }) => {
    const result = await system.describe.columns.createOne({
        schema_name: schema!,
        column_name: column!,
        ...body
    });

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
