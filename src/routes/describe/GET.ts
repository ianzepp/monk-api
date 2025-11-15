import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/describe - List all schema names
 * @see docs/31-meta-api.md
 */
export default withParams(async (context, { system }) => {
    const schemas = await system.describe.listSchemas();
    // Extract just the schema names from the full schema objects
    const schemaNames = schemas.map((schema: any) => schema.schema_name);
    setRouteResult(context, schemaNames);
});
