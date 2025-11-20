import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * GET /api/describe/:schema - Get schema metadata
 *
 * Returns schema record only (without columns).
 * Use GET /api/describe/:schema/:column for individual column definitions.
 */
export default withParams(async (context, { system, schema }) => {
    const result = await system.describe.schemas.select404(
        { where: { schema_name: schema } },
        `Schema '${schema}' not found`
    );

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
