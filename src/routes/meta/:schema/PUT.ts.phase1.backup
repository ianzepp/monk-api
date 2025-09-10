import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withTransactionParams(async (context, { system, schema, body }) => {
    // body is automatically parsed JSON object for application/json content-type
    const result = await system.metabase.updateOne(schema!, body);
    setRouteResult(context, result);
});
