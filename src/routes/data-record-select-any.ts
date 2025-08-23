import type { Context } from 'hono';
import { handleContextDb } from '@lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextDb(context, async (system) => {
        const schemaName = context.req.param('schema');
        
        console.debug('routes/data-record-select-any: schemaName=%j', schemaName);
        
        return system.database.selectAny(schemaName);
    });
}
