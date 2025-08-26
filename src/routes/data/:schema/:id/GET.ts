import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('schema');
    const recordId = context.req.param('id');
    
    logger.info('Data record select one', { schemaName, recordId });
    
    const result = await system.database.select404(schemaName, { where: { id: recordId }});
    setRouteResult(context, result);
}
