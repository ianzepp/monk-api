import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';

/**
 * DELETE /api/acls/:model/:record - Clear all ACL lists
 *
 * Removes all access control entries and returns the record to default status.
 * This sets all four access arrays to empty arrays:
 * - access_read: []
 * - access_edit: []
 * - access_full: []
 * - access_deny: []
 *
 * After this operation, the record will use default role-based permissions.
 */
export default withTransactionParams(async (context, { system, model, record, options }) => {
    // Verify record exists before updating (select404 automatically throws 404 if not found)
    await system.database.select404(model!, {
        where: { id: record! },
        select: ['id']
    }, undefined, options);

    // Clear all ACL lists by setting them to empty arrays
    const updates = {
        access_read: [],
        access_edit: [],
        access_full: [],
        access_deny: []
    };

    const result = await system.database.updateOne(model!, record!, updates);

    // Return ACL data (middleware will wrap in success response)
    setRouteResult(context, {
        record_id: record,
        model: model,
        status: 'default_permissions',
        access_lists: {
            access_read: [],
            access_edit: [],
            access_full: [],
            access_deny: []
        }
    });
});
