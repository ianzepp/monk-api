import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema, body }) => {
    // Always expect array input for POST /api/data/:schema
    if (!Array.isArray(body)) {
        throw new Error('POST /api/data/:schema expects an array of records');
    }
    
    logger.info('Data record create all', { schema, recordCount: body.length });
    const result = await system.database.createAll(schema!, body);
    setRouteResult(context, result);
});
