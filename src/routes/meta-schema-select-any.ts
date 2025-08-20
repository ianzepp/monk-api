import type { Context } from 'hono';
import { System } from '../lib/system.js';
import { handleContextDb } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextDb(context, async (system: System) => {
        return await system.database.listSchemas();
    });
}