import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/data/:model/:record/:relationship/:child - Get specific related record
 * Returns a single child record, verifying both parent and child accessibility
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, relationship, options }) => {
    const childId = context.req.param('child');

    // Verify parent record data is readable
    const parentRecord = await system.database.select404(model!, { where: { id: record! } }, undefined, options);

    // Get relationship metadata (cached)
    const rel = await system.database.getRelationship(model!, relationship!);

    // Get the specific child record, verifying it belongs to the parent
    const childRecord = await system.database.select404(rel.childModel, {
        where: {
            id: childId!,
            [rel.fieldName]: record // Ensure child belongs to this parent
        }
    }, undefined, options);

    setRouteResult(context, childRecord);
});
