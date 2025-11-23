import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/data/:model - Create multiple records in model
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, body }) => {
    // Always expect array input for POST /api/data/:model
    if (!Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
    }

    const result = await system.database.createAll(model!, body);
    setRouteResult(context, result);
});
