import type { Context } from 'hono';
import { createSchema } from '../lib/schema.js';
import { withErrorHandling } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withErrorHandling(c, async () => {
        const schemaName = c.req.param('schema');
        
        // Create schema instance (validates existence)
        const schema = await createSchema(schemaName);

        // Use schema's selectAll method
        return await schema.selectAll();
    });
}
