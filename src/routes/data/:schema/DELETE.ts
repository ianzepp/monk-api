import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema, body }) => {
    const isPermanent = context.req.query('permanent') === 'true';

    // Always expect array input for DELETE /api/data/:schema
    if (!Array.isArray(body)) {
        throw new Error('DELETE /api/data/:schema expects an array of records with id fields');
    }
    
    let result;
    
    // Permanent delete: set deleted_at = NOW() for all records
    if (isPermanent) {
        // Check root access for permanent deletes
        if (!system.isRoot()) {
            throw new Error('Access denied: only root access level can perform permanent deletes');
        }
        
        const permanentUpdates = body.map(record => ({
            id: record.id,
            deleted_at: new Date().toISOString()
        }));
        
        result = await system.database.updateAll(schema!, permanentUpdates);
    } 
    
    // Normal soft delete: set trashed_at = NOW()
    else {
        result = await system.database.deleteAll(schema!, body);
    }
    
    setRouteResult(context, result);
});