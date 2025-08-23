import type { Context } from 'hono';
import { System } from '@lib/system.js';
import { handleContextTx } from '@lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system: System) => {
        const schemaName = context.req.param('schema');
        const recordId = context.req.param('id');            
        const recordData = await context.req.json();
        const method = context.req.method;

        console.debug('routes/data-record-update-one: method=%j schemaName=%j recordId=%j recordData=%j options=%j', 
            method, schemaName, recordId, recordData, system.options);
        
        // Smart routing: PATCH + include_trashed=true = revert operation
        if (method === 'PATCH' && system.options.trashed === true) {
            console.debug('routes/data-record-update-one: routing to revertOne() for revert operation');
            return await system.database.revertOne(schemaName, recordId);
        } else {
            console.debug('routes/data-record-update-one: routing to updateOne() for normal update');
            return system.database.updateOne(schemaName, recordId, recordData);
        }
    });
}
