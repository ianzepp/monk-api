import type { Context } from 'hono';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const recordList = await context.req.json();

        // Always expect array input for POST /api/data/:schema
        if (!Array.isArray(recordList)) {
            throw new Error('POST /api/data/:schema expects an array of records');
        }
        
        console.debug('routes/data-record-create-all: schemaName=%j recordCount=%d', schemaName, recordList.length);

        return await system.database.createAll(schemaName, recordList);
    });
}
