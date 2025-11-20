import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * PUT /api/describe/:schema - Update schema metadata
 *
 * Updates schema properties like status, sudo, freeze.
 * Does not modify columns - use column endpoints for that.
 */
export default withTransactionParams(async (context, { system, schema, body }) => {
    const result = await system.describe.schemas.update404(
        { where: { schema_name: schema } },
        body,
        `Schema '${schema}' not found`
    );
    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
