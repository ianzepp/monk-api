import type { Context } from 'hono';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const deleteList = await context.req.json();
        const isPermanent = context.req.query('permanent') === 'true';

        // Always expect array input for DELETE /api/data/:schema
        if (!Array.isArray(deleteList)) {
            throw new Error('DELETE /api/data/:schema expects an array of records with id fields');
        }
        
        console.debug('routes/data-record-delete-all: schemaName=%j deleteCount=%d permanent=%j', schemaName, deleteList.length, isPermanent);

        if (isPermanent) {
            // Check root access for permanent deletes
            if (!system.isRoot()) {
                throw new Error('Access denied: only root access level can perform permanent deletes');
            }
            
            // Permanent delete: set deleted_at = NOW() for all records
            const permanentUpdates = deleteList.map(record => ({
                id: record.id,
                deleted_at: new Date().toISOString()
            }));
            
            return await system.database.updateAll(schemaName, permanentUpdates);
        } else {
            // Normal soft delete: set trashed_at = NOW()
            return await system.database.deleteAll(schemaName, deleteList);
        }
    });
}