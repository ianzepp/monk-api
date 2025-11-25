import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/data/:model/:record/:relationship - Get related records for a parent
 * Returns array of child records that have an owned relationship to the parent record
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, relationship, options }) => {
    // Verify parent record data is readable
    const recordData = await system.database.select404(model!, { where: { id: record! } }, undefined, options);

    // Get relationship metadata (cached)
    const rel = await system.database.getRelationship(model!, relationship!);

    // Query child records that reference this parent
    const result = await system.database.selectAny(rel.childModel, {
        where: { [rel.fieldName]: record }
    });

    setRouteResult(context, result);
});
