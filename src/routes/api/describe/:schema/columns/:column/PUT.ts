import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * PUT /api/describe/:schema/columns/:column
 *
 * Update an existing column in Monk-native format
 *
 * Request body: Column definition updates in Monk format
 * @returns Updated column record from columns table
 */
export default withTransactionParams(async (context, { system, schema, column, body }) => {
    const result = await system.describe.columns.update404(
        { where: { schema_name: schema, column_name: column } },
        body,
        `Column '${column}' not found in schema '${schema}'`
    );

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
