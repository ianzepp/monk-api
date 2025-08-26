import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default async function (context: Context): Promise<any> {
    const schemaName = context.req.param('schema');
    const recordList = await context.req.json();
    const system = context.get('system');

    // Always expect array input for POST /api/data/:schema
    if (!Array.isArray(recordList)) {
        throw new Error('POST /api/data/:schema expects an array of records');
    }
    
    logger.info('Data record create all', { schemaName, recordCount: recordList.length });

    const result = await system.database.createAll(schemaName, recordList);
    setRouteResult(context, result);
}
