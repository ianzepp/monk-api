import type { Context } from 'hono';
import { database } from '../lib/database.js';
import { withTransaction } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withTransaction(c, async (tx) => {
        const schemaName = c.req.param('schema');
        const recordData = await c.req.json();
        return database.createOne(schemaName, recordData, tx);
    }, 201);
}
