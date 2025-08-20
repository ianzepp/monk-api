import type { Context } from 'hono';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const deleteList = await context.req.json();

        // Always expect array input for DELETE /api/data/:schema
        if (!Array.isArray(deleteList)) {
            throw new Error('DELETE /api/data/:schema expects an array of records with id fields');
        }
        
        console.debug('routes/data-record-delete-all: schemaName=%j deleteCount=%d', schemaName, deleteList.length);

        return await system.database.deleteAll(schemaName, deleteList);
    });
}