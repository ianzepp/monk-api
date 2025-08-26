import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('name');
    const yamlContent = await context.req.text();
    
    logger.info('Meta schema put', { schemaName });
    
    // Update schema via Metabase
    await system.metabase.updateOne(schemaName, yamlContent);
    
    // Set result for middleware formatting
    setRouteResult(context, yamlContent);
}
