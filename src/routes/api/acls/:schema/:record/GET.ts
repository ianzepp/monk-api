import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/acls/:schema/:record - Get record ACL lists
 * 
 * Returns the four access control arrays for a specific record:
 * - access_read: User IDs with read access
 * - access_edit: User IDs with edit access  
 * - access_full: User IDs with full access
 * - access_deny: User IDs with denied access
 */
export default withParams(async (context, { system, schema, record, options }) => {
    // Get the record with only ACL fields (select404 automatically throws 404 if not found)
    const result = await system.database.select404(schema!, { 
        where: { id: record! },
        select: ['id', 'access_read', 'access_edit', 'access_full', 'access_deny']
    }, undefined, options);

    // Return structured ACL data (middleware will wrap in success response)
    const aclData = {
        record_id: result.id,
        schema: schema,
        access_lists: {
            access_read: result.access_read || [],
            access_edit: result.access_edit || [],
            access_full: result.access_full || [],
            access_deny: result.access_deny || []
        }
    };

    setRouteResult(context, aclData);
});