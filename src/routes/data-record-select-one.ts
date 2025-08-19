import type { Context } from 'hono';
import { createSchema } from '../lib/schema.js';
import { withErrorHandling } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withErrorHandling(c, async () => {
        const schemaName = c.req.param('schema');
        const recordId = c.req.param('id');
        
        // Create schema instance and get specific record
        const schema = await createSchema(schemaName);
        const result = await schema.selectOne(recordId);
        
        if (!result) {
            throw new Error(`Record '${recordId}' not found`);
        }
        
        return result;
    });
}
