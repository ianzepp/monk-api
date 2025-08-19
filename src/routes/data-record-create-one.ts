import type { Context } from 'hono';
import { createSchema } from '../lib/schema.js';
import { withTransaction } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withTransaction(c, async (tx) => {
        const schemaName = c.req.param('schema');
        const body = await c.req.json();
        
        // Create schema instance and record
        const schema = await createSchema(schemaName);
        return await schema.createOne(body, tx);
    }, 201);
}
