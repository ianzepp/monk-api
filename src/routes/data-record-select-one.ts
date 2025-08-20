import type { Context } from 'hono';
import { System } from '../lib/system.js';

export default async function (context: Context): Promise<any> {
    return await System.handleDb(context, async (system: System) => {
        const schemaName = context.req.param('schema');
        const recordId = context.req.param('id');            
        return system.database.select404(schemaName, { where: { id: recordId }});
    });
}
