import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * DELETE /api/data/:model/:record/:relationship - Delete all related records
 * Deletes all child records belonging to the parent relationship
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, relationship, body, options }) => {
    // Verify parent record data is readable
    const parentRecord = await system.database.select404(model!, { where: { id: record! } }, undefined, options);

    // Get relationship metadata (cached)
    const rel = await system.database.getRelationship(model!, relationship!);

    // Delete all child records belonging to this parent
    const result = await system.database.deleteAny(rel.childModel, {
        where: { [rel.fieldName]: record }
    });

    setRouteResult(context, result);
});
