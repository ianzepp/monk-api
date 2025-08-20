import type { Context } from 'hono';
import { System } from '../lib/system.js';
import { handleContextDb } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextDb(context, async (system: System) => {
        const schemaName = context.req.param('name');
        const result = await system.database.toSchema(schemaName);

        if (!result) {
            throw new Error(`Schema '${schemaName}' not found`);
        }
        
        return result;
    });
}
