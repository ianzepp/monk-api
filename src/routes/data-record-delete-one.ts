import type { Context } from 'hono';
import { createSchema } from '../lib/schema.js';
import { database } from '../lib/database.js';
import { withTransaction } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withTransaction(c, async (tx) => {
        const schemaName = c.req.param('schema');
        const recordId = c.req.param('id');
        return database.delete404(schemaName, { where: { id: recordId }}, tx);
    });
}
