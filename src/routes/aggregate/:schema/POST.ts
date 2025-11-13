import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { withParams } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export default withParams(async (context, { system, schema, body, options }) => {
    console.debug('routes/aggregate-schema: schema=%j', schema);

    // Validate request body
    if (!body || typeof body !== 'object') {
        throw HttpErrors.badRequest('Request body must be a valid JSON object', 'REQUEST_INVALID_BODY');
    }

    // Validate aggregations
    if (!body.aggregate || typeof body.aggregate !== 'object' || Object.keys(body.aggregate).length === 0) {
        throw HttpErrors.badRequest('Request must include "aggregate" object with at least one aggregation function', 'REQUEST_MISSING_AGGREGATIONS');
    }

    // Extract parameters
    const filterData = body.where ? { where: body.where } : {};
    const aggregations = body.aggregate;
    const groupBy = body.groupBy || body.group_by;

    // Execute aggregation
    const result = await system.database.aggregate(
        schema!,
        filterData,
        aggregations,
        groupBy,
        options
    );

    setRouteResult(context, result);
});
