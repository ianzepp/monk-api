import type { Context } from 'hono';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const recordData = await context.req.json();

        console.debug('routes/data-record-create-one: schemaName=%j recordData=%j', schemaName, recordData);

        return system.database.createOne(schemaName, recordData);
    });
}
