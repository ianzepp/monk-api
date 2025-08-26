import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('name');
    
    logger.info('Meta schema delete', { schemaName });
    
    // Delete schema via Metabase
    const result = await system.metabase.deleteOne(schemaName);
    
    // Set result for middleware formatting (DELETE returns JSON, not YAML)
    setRouteResult(context, result);
}
