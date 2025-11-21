import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/data/:schema - Bulk update records in schema
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, schema, body, method }) => {
    // Always expect array input for PUT/PATCH /api/data/:schema
    if (!Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
    }

    let result;

    // Smart routing: PATCH + include_trashed=true = revert operation
    if (method === 'PATCH' && system.options.trashed === true) {
        result = await system.database.revertAll(schema!, body);
    }

    // Normal update operation
    else {
        result = await system.database.updateAll(schema!, body);
    }

    setRouteResult(context, result);
});
