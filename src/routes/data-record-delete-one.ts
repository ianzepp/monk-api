import type { Context } from 'hono';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const recordId = context.req.param('id');
        
        console.debug('routes/data-record-delete-one: schemaName=%j recordId=%j', schemaName, recordId);
        
        return system.database.delete404(schemaName, { where: { id: recordId }});
    });
}
