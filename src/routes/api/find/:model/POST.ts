import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { withTransactionParams } from '@src/lib/api-helpers.js';

export default withTransactionParams(async (context, { system, model, body, options }) => {
    console.debug('routes/find-model: model=%j', model);

    const result = await system.database.selectAny(model!, body, options);

    // If count=true or includeTotal=true, include total filtered count for pagination
    if (body?.count === true || body?.includeTotal === true) {
        const total = await system.database.count(model!, body);
        // Store result with total metadata
        context.set('routeResult', result);
        context.set('routeTotal', total);
    } else {
        setRouteResult(context, result);
    }
});
