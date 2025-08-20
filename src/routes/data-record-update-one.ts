import type { Context } from 'hono';
import { System } from '../lib/system.js';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system: System) => {
        const schemaName = context.req.param('schema');
        const recordId = context.req.param('id');            
        const recordData = await context.req.json();
        
        console.debug('routes/data-record-update-one: schemaName=%j recordId=%j recordData=%j', schemaName, recordId, recordData);
        
        return system.database.updateOne(schemaName, recordId, recordData);
    });
}
