import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema, recordId }) => {
    const result = await system.database.select404(schema!, { where: { id: recordId! }});
    setRouteResult(context, result);
});
