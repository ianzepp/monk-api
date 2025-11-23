import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * PUT /api/data/:model/:id - Update single record by ID
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, body, method }) => {
    let result;

    // Smart routing: PATCH + include_trashed=true = revert operation
    if (method === 'PATCH' && system.options.trashed === true) {
        result = await system.database.revertOne(model!, record!);
    }

    // Normal update operation
    else {
        result = await system.database.updateOne(model!, record!, body);
    }

    setRouteResult(context, result);
});
