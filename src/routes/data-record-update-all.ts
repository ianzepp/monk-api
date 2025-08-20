import type { Context } from 'hono';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const updateList = await context.req.json();

        // Always expect array input for PUT /api/data/:schema
        if (!Array.isArray(updateList)) {
            throw new Error('PUT /api/data/:schema expects an array of update records with id fields');
        }
        
        console.debug('routes/data-record-update-all: schemaName=%j updateCount=%d', schemaName, updateList.length);

        return await system.database.updateAll(schemaName, updateList);
    });
}