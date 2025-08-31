import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/data/:schema - Create multiple records in schema
 * @see docs/routes/DATA_API.md
 */
export default withParams(async (context, { system, schema, body }) => {
    // Always expect array input for POST /api/data/:schema
    if (!Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an array of records', 'REQUEST_INVALID_FORMAT');
    }
    
    const result = await system.database.createAll(schema!, body);
    setRouteResult(context, result);
});
