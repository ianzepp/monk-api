import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/acls/:model/:record - Merge ACL entries
 *
 * Merges new user IDs into existing access control lists.
 * Request body should contain arrays of user IDs to add:
 * {
 *   "access_read": ["user1", "user2"],
 *   "access_edit": ["user3"],
 *   "access_full": ["admin1"],
 *   "access_deny": ["blocked1"]
 * }
 */
export default withTransactionParams(async (context, { system, model, record, options }) => {
    const body = await context.req.json().catch(() => ({}));

    // Validate request body structure
    const validFields = ['access_read', 'access_edit', 'access_full', 'access_deny'];
    const updates: any = {};
    let hasValidUpdates = false;

    for (const field of validFields) {
        if (field in body) {
            if (!Array.isArray(body[field])) {
                throw HttpErrors.badRequest(`${field} must be an array`, 'INVALID_ACL_FORMAT');
            }

            // Validate all entries are strings (user IDs)
            if (!body[field].every((id: any) => typeof id === 'string')) {
                throw HttpErrors.badRequest(`${field} must contain only string user IDs`, 'INVALID_USER_ID_FORMAT');
            }

            updates[field] = body[field];
            hasValidUpdates = true;
        }
    }

    if (!hasValidUpdates) {
        throw HttpErrors.badRequest('At least one access list must be provided', 'NO_ACL_UPDATES');
    }

    // Get current record to merge with existing ACLs (select404 automatically throws 404 if not found)
    const currentRecord = await system.database.select404(model!, {
        where: { id: record! },
        select: ['id', 'access_read', 'access_edit', 'access_full', 'access_deny']
    }, undefined, options);

    // Merge new IDs with existing lists (avoid duplicates)
    const mergedUpdates: any = {};
    for (const field of validFields) {
        if (field in updates) {
            const existing = currentRecord[field] || [];
            const newIds = updates[field];
            // Merge and deduplicate
            mergedUpdates[field] = [...new Set([...existing, ...newIds])];
        }
    }

    // Update the record (returns the updated record)
    const updatedRecord = await system.database.updateOne(model!, record!, mergedUpdates);

    // Return ACL data (middleware will wrap in success response)
    setRouteResult(context, {
        record_id: record,
        updated_lists: Object.keys(mergedUpdates),
        access_lists: {
            access_read: updatedRecord.access_read || [],
            access_edit: updatedRecord.access_edit || [],
            access_full: updatedRecord.access_full || [],
            access_deny: updatedRecord.access_deny || []
        }
    });
});
