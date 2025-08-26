import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('schema');
    const recordId = context.req.param('id');
    const isPermanent = context.req.query('permanent') === 'true';

    console.debug('routes/data-record-delete-one: schemaName=%j recordId=%j permanent=%j', schemaName, recordId, isPermanent);
    
    let result;
    if (isPermanent) {
        // Check root access for permanent deletes
        if (!system.isRoot()) {
            throw new Error('Access denied: only root access level can perform permanent deletes');
        }
        
        // Permanent delete: set deleted_at = NOW()
        result = await system.database.updateOne(schemaName, recordId, { deleted_at: new Date().toISOString() });
    } else {
        // Normal soft delete: set trashed_at = NOW()
        result = await system.database.delete404(schemaName, { where: { id: recordId }});
    }
    
    setRouteResult(context, result);
}
