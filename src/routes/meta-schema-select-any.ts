import type { Context } from 'hono';
import { database } from '../lib/database.js';
import { withErrorHandling } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withErrorHandling(c, async () => {
        // List all schemas using context-aware database service
        return await database.listSchemas(c);
    });
}