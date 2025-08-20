import type { Context } from 'hono';
import { System } from '../lib/system.js';

export default async function (context: Context): Promise<any> {
    return await System.handleDb(context, async (system: System) => {
        const schemaName = context.req.param('schema');
        const result = await system.database.toSchema(schemaName);

        if (!result) {
            throw new Error(`Schema '${schemaName}' not found`);
        }
        
        return result;
    });
}
