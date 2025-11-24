import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export default withTransactionParams(async (context, { system, model, body, options }) => {
    console.debug('routes/aggregate-model: model=%j', model);

    // Validate request body
    if (!body || typeof body !== 'object') {
        throw HttpErrors.badRequest('Request body must be an object', 'BODY_NOT_OBJECT');
    }

    // Validate aggregations
    if (!body.aggregate || typeof body.aggregate !== 'object' || Object.keys(body.aggregate).length === 0) {
        throw HttpErrors.badRequest('Request must include "aggregate" field with at least one aggregation function', 'BODY_MISSING_FIELD');
    }

    // Extract parameters
    const filterData = body.where ? { where: body.where } : {};
    const aggregations = body.aggregate;
    const groupBy = body.groupBy || body.group_by;

    // Execute aggregation
    const result = await system.database.aggregate(
        model!,
        filterData,
        aggregations,
        groupBy,
        options
    );

    setRouteResult(context, result);
});
