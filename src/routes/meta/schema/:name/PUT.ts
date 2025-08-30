import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schemaName, body }) => {
    // body is automatically parsed JSON object for application/json content-type
    await system.metabase.updateOne(schemaName!, body);
    setRouteResult(context, body);
});
