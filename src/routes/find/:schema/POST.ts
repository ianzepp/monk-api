import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { withParams } from '@src/lib/api-helpers.js';

export default withParams(async (context, { system, schema, body, options }) => {
    console.debug('routes/find-schema: schema=%j', schema);

    const result = await system.database.selectAny(schema!, body, options);
    setRouteResult(context, result);
});
