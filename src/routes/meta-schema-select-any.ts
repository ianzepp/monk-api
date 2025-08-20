import type { Context } from 'hono';
import { System } from '../lib/system.js';

export default async function (context: Context): Promise<any> {
    return await System.handleDb(context, async (system: System) => {
        return await system.database.listSchemas();
    });
}