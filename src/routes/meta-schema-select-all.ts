import type { Context } from 'hono';
import { db, schema } from '../db/index.js';
import { withErrorHandling } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withErrorHandling(c, async () => {
        // List all schemas
        return await db.select().from(schema.schemas);
    });
}