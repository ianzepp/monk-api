import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const yamlContent = await context.req.text();
    
    // Parse YAML to get schema name
    const jsonSchema = system.metabase.parseYaml(yamlContent);
    const schemaName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');
    
    logger.info('Creating schema', { schemaName });
    
    // Create schema via Metabase
    await system.metabase.createOne(schemaName, yamlContent);
    
    // Set result for middleware formatting
    setRouteResult(context, yamlContent);
}
