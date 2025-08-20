import type { Context } from 'hono';
import { handleContextDb } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextDb(context, async (system) => {
        const schemaName = context.req.param('schema');
        const recordId = context.req.param('id');
        
        console.debug('routes/data-record-select-one: schemaName=%j recordId=%j', schemaName, recordId);
        
        return system.database.select404(schemaName, { where: { id: recordId }});
    });
}
