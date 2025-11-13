import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { withParams } from '@src/lib/api-helpers.js';

export default withParams(async (context, { system, schema, body, options }) => {
    console.debug('routes/find-schema: schema=%j', schema);

    const result = await system.database.selectAny(schema!, body, options);
    
    // If count=true or includeTotal=true, include total filtered count for pagination
    if (body?.count === true || body?.includeTotal === true) {
        const total = await system.database.count(schema!, body);
        // Store result with total metadata
        context.set('routeResult', result);
        context.set('routeTotal', total);
    } else {
        setRouteResult(context, result);
    }
});
