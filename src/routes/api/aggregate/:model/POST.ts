import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { withTransactionParams } from '@src/lib/api-helpers.js';

export default withTransactionParams(async (context, { system, model, body, options }) => {
    console.debug('routes/aggregate-model: model=%j', model);

    const result = await system.database.aggregate(model!, body, options);

    setRouteResult(context, result);
});
