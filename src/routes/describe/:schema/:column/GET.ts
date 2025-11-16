import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { isSystemField } from '@src/lib/describe.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /api/describe/:schema/:column
 *
 * Retrieve column definition in Monk-native format
 *
 * @returns Column record from columns table
 */
export default withParams(async (context, { system, schema, column }) => {
    // Reject requests for system columns - Describe API is for portable definitions only
    if (isSystemField(column!)) {
        throw HttpErrors.notFound(
            `Column '${column}' is a system column and not available via Describe API`,
            'SYSTEM_COLUMN_NOT_ACCESSIBLE'
        );
    }

    const columnDef = await system.describe.selectColumn(schema!, column!);
    setRouteResult(context, columnDef);
});
