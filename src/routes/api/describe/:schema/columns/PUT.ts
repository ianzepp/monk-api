import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/describe/:schema/columns
 *
 * Update multiple columns in bulk
 *
 * Request body: Array of column updates
 * Each column must have: column_name (and any fields to update: type, required, default_value, etc.)
 * @returns Array of updated column records from columns table
 */
export default withTransactionParams(async (context, { system, schema, body }) => {
    // TODO: Complete implementation - need to map column_name to id using schema cache
    throw HttpErrors.notImplemented(
        'Bulk column update endpoint is incomplete - use PUT /api/describe/:schema/columns/:column for single column updates',
        'ENDPOINT_INCOMPLETE'
    );

    // Validate body is an array
    if (!Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an array of column updates');
    }

    // Validate each column has column_name
    for (const column of body as any[]) {
        if (!column.column_name) {
            throw HttpErrors.badRequest('Each column update must include column_name');
        }
    }

    // Inject schema_name into each column update
    const columnsToUpdate = body.map((column: any) => ({
        schema_name: schema!,
        ...column
    }));

    console.log('PUT /api/describe/:schema/columns - Updating columns in bulk:', {
        schema: schema!,
        columnCount: columnsToUpdate.length
    });

    const results = await system.describe.columns.updateAll(columnsToUpdate);

    // Strip system fields from all results
    setRouteResult(context, results.map(stripSystemFields));
});
