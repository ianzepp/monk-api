import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema, recordId }) => {
    const isPermanent = context.req.query('permanent') === 'true';
    
    let result;
    
    // Permanent delete: set deleted_at = NOW()
    if (isPermanent) {
        // Check root access for permanent deletes
        if (!system.isRoot()) {
            throw new Error('Access denied: only root access level can perform permanent deletes');
        }
        
        result = await system.database.updateOne(schema!, recordId!, { deleted_at: new Date().toISOString() });
    } 
    
    // Normal soft delete: set trashed_at = NOW()
    else {
        result = await system.database.delete404(schema!, { where: { id: recordId! }});
    }
    
    setRouteResult(context, result);
});
