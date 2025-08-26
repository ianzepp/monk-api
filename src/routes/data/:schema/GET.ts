import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('schema');
    
    logger.info('Data record select any', { schemaName });
    
    const result = await system.database.selectAny(schemaName);
    setRouteResult(context, result);
}
