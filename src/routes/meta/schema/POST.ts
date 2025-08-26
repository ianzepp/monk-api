import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, body }) => {
    // Parse YAML to get schema name
    const jsonSchema = system.metabase.parseYaml(body);
    const schemaName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');
    
    // Create schema via Metabase
    await system.metabase.createOne(schemaName, body);
    
    // Set result for middleware formatting
    setRouteResult(context, body);
});
