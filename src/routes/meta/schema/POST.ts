import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schemaName, body }) => {
    // Parse YAML to get schema name from content
    const jsonSchema = system.metabase.parseYaml(body);
    const yamlName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');
    
    // Use URL name if provided, otherwise fall back to YAML name
    const urlName = schemaName || yamlName;
    
    // Only check conflicts if BOTH are present
    if (schemaName && urlName !== yamlName) {
        const forceOverride = context.req.query('force') === 'true';
        
        if (!forceOverride) {
            throw new Error(`URL name '${urlName}' conflicts with YAML title '${yamlName}'. Use ?force=true to override.`);
        }
    }
    
    // Create schema via Metabase using the final determined name
    await system.metabase.createOne(urlName, body);
    
    // Set result for middleware formatting
    setRouteResult(context, body);
});
