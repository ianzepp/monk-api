import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * DELETE /api/describe/:schema - Delete schema
 *
 * Soft deletes schema and drops table via observer pipeline.
 */
export default withTransactionParams(async (context, { system, schema }) => {
    const result = await system.describe.schemas.delete404(
        { where: { schema_name: schema } },
        `Schema '${schema}' not found`
    );

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
