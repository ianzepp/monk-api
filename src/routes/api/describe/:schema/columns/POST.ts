import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/describe/:schema/columns
 *
 * Create multiple columns in bulk
 *
 * Request body: Array of column definitions
 * Each column must have: column_name, type (and optional: required, default_value, etc.)
 * @returns Array of created column records from columns table
 */
export default withTransactionParams(async (context, { system, schema, body }) => {
    // Validate body is an array
    if (!Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an array of column definitions');
    }

    // Validate each column has column_name
    for (const column of body) {
        if (!column.column_name) {
            throw HttpErrors.badRequest('Each column definition must include column_name');
        }
    }

    // Inject schema_name into each column definition
    const columnsToCreate = body.map(column => ({
        schema_name: schema!,
        ...column
    }));

    console.log('POST /api/describe/:schema/columns - Creating columns in bulk:', {
        schema: schema!,
        columnCount: columnsToCreate.length
    });

    const results = await system.describe.columns.createAll(columnsToCreate);

    // Strip system fields from all results
    setRouteResult(context, results.map(stripSystemFields));
});
