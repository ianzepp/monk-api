import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export default withTransactionParams(async (context, { system, schema, body }) => {
    // Parse JSON to get schema name from content
    const jsonSchema = system.describe.parseSchema(body);
    const jsonName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');

    // URL schema must match jsonName if force !== true
    if (schema !== jsonName) {
        const forceOverride = context.req.query('force') === 'true';

        if (!forceOverride) {
            throw HttpErrors.conflict(`URL schema name '${schema}' conflicts with JSON title '${jsonName}'. Use ?force=true to override.`, 'SCHEMA_NAME_CONFLICT');
        }
    }

    // Create schema via Describe using the final determined name
    const result = await system.describe.createOne(schema!, body);

    // Set result for middleware formatting
    setRouteResult(context, result);
});
