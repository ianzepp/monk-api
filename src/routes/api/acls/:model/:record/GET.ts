import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/acls/:model/:record - Get record ACL lists
 *
 * Returns the four access control arrays for a specific record:
 * - access_read: User IDs with read access
 * - access_edit: User IDs with edit access
 * - access_full: User IDs with full access
 * - access_deny: User IDs with denied access
 */
export default withTransaction(async ({ system, params, query }) => {
    const { model, record } = params;
    const options = { context: 'api' as const, trashed: query.trashed as any };

    // Get the record with only ACL fields (select404 automatically throws 404 if not found)
    const result = await system.database.select404(model!, {
        where: { id: record! },
        select: ['id', 'access_read', 'access_edit', 'access_full', 'access_deny']
    }, undefined, options);

    // Return structured ACL data (middleware will wrap in success response)
    return {
        record_id: result.id,
        model: model,
        access_lists: {
            access_read: result.access_read || [],
            access_edit: result.access_edit || [],
            access_full: result.access_full || [],
            access_deny: result.access_deny || []
        }
    };
});
