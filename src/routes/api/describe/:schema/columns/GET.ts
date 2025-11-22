import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
/**
 * GET /api/describe/:schema/columns - List all columns for a schema
 *
 * Returns array of all column definitions for the specified schema.
 */
export default withParams(async (context, { system, schema }) => {
    const schemaRecord = await system.describe.schemas.selectOne({ schema: schema });

    if (!schemaRecord) {
        throw HttpErrors.notFound(`Schema '${schema}' not found`, 'SCHEMA_NOT_FOUND');
    }

    // Query columns table for all columns in this schema
    const columns = await system.describe.columns.selectAny({
        where: { schema_name: schema },
        order: { column_name: 'asc' }
    });

    setRouteResult(context, columns);
});
