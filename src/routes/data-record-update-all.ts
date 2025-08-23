import type { Context } from 'hono';
import { handleContextTx } from '@lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const updateList = await context.req.json();
        const method = context.req.method;

        // Always expect array input for PUT/PATCH /api/data/:schema
        if (!Array.isArray(updateList)) {
            throw new Error(`${method} /api/data/:schema expects an array of update records with id fields`);
        }
        
        console.debug('routes/data-record-update-all: method=%j schemaName=%j updateCount=%d options=%j', 
            method, schemaName, updateList.length, system.options);

        // Smart routing: PATCH + include_trashed=true = revert operation
        if (method === 'PATCH' && system.options.trashed === true) {
            console.debug('routes/data-record-update-all: routing to revertAll() for revert operation');
            return await system.database.revertAll(schemaName, updateList);
        } else {
            console.debug('routes/data-record-update-all: routing to updateAll() for normal update');
            return await system.database.updateAll(schemaName, updateList);
        }
    });
}