import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';

/**
 * DELETE /api/data/:model/:record/:relationship/:child - Delete specific related record
 * Deletes a single child record, verifying both parent accessibility and child ownership
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, relationship, options }) => {
    const childId = context.req.param('child');

    // Verify parent record data is readable
    const parentRecord = await system.database.select404(model!, { where: { id: record! } }, undefined, options);

    // Get relationship metadata (cached)
    const rel = await system.database.getRelationship(model!, relationship!);

    // Delete the child record, verifying it exists and belongs to this parent
    const result = await system.database.delete404(rel.childModel, {
        where: {
            id: childId!,
            [rel.fieldName]: record // Ensure child belongs to this parent
        }
    });

    setRouteResult(context, result);
});
