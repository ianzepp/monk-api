import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('name');
    
    console.debug(`GET /api/meta/schema/${schemaName}`);
    
    // Get schema YAML via Metabase
    const yamlContent = await system.metabase.selectOne(schemaName);
    
    // Set result for middleware formatting
    setRouteResult(context, yamlContent);
}
