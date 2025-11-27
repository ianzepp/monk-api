import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/data/:model/:record/:relationship/:child - Get specific related record
 * Returns a single child record, verifying both parent and child accessibility
 * @see docs/routes/DATA_API.md
 */
export default withTransaction(async ({ system, params, query }) => {
    const { model, record, relationship, child } = params;
    const options = { context: 'api' as const, trashed: query.trashed as any };

    // Verify parent record data is readable
    const parentRecord = await system.database.select404(model!, { where: { id: record! } }, undefined, options);

    // Get relationship metadata (cached)
    const rel = await system.database.getRelationship(model!, relationship!);

    // Get the specific child record, verifying it belongs to the parent
    const childRecord = await system.database.select404(rel.childModel, {
        where: {
            id: child!,
            [rel.fieldName]: record // Ensure child belongs to this parent
        }
    }, undefined, options);

    return childRecord;
});
