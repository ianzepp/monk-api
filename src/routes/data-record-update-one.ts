import type { Context } from 'hono';
import { System } from '../lib/system.js';

export default async function (context: Context): Promise<any> {
    return await System.handleTx(context, async (system: System) => {
        const schemaName = context.req.param('schema');
        const recordId = context.req.param('id');            
        const recordData = await context.req.json();
        return system.database.updateOne(schemaName, recordId, recordData);
    });
}
