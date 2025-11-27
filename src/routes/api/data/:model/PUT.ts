import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/data/:model - Bulk update records in model
 * PATCH /api/data/:model - Filter-based update or revert operation
 *
 * PUT: Expects array of records with IDs [{id, ...changes}]
 * PATCH + ?where={json}: Filter-based update, body is the changes object
 * PATCH + ?include_trashed=true: Revert trashed records, body is array of {id}
 *
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, body, method }) => {
    let result;

    // PATCH with ?where filter = filter-based update (updateAny)
    const whereParam = context.req.query('where');
    if (method === 'PATCH' && whereParam) {
        // Body must be an object (the changes to apply)
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw HttpErrors.badRequest('Request body must be an object of changes for filter-based update', 'BODY_NOT_OBJECT');
        }

        const filterData = { where: JSON.parse(whereParam) };
        result = await system.database.updateAny(model!, filterData, body);
    }

    // PATCH + include_trashed=true = revert operation
    else if (method === 'PATCH' && system.options.trashed === true) {
        if (!Array.isArray(body)) {
            throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
        }
        result = await system.database.revertAll(model!, body);
    }

    // Normal PUT: bulk update by ID
    else {
        if (!Array.isArray(body)) {
            throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
        }
        result = await system.database.updateAll(model!, body);
    }

    setRouteResult(context, result);
});
