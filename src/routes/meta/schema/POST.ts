import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export default withParams(async (context, { system, schemaName, body }) => {
    // Parse JSON to get schema name from content
    const jsonSchema = system.metabase.parseSchema(body);
    const jsonName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');
    
    // Use URL name if provided, otherwise fall back to JSON name
    const urlName = schemaName || jsonName;
    
    // Only check conflicts if BOTH are present
    if (schemaName && urlName !== jsonName) {
        const forceOverride = context.req.query('force') === 'true';
        
        if (!forceOverride) {
            throw HttpErrors.conflict(`URL name '${urlName}' conflicts with JSON title '${jsonName}'. Use ?force=true to override.`, 'SCHEMA_NAME_CONFLICT');
        }
    }
    
    // Create schema via Metabase using the final determined name
    await system.metabase.createOne(urlName, body);
    
    // Set result for middleware formatting
    setRouteResult(context, body);
});
