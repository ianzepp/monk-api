import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * DELETE /api/describe/:schema/:column
 *
 * Delete a column from the schema
 *
 * @returns Deletion confirmation
 */
export default withTransactionParams(async (context, { system, schema, column }) => {
    const result = await system.describe.columns.delete404(
        { where: { schema_name: schema, column_name: column } },
        `Column '${column}' not found in schema '${schema}'`
    );

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
