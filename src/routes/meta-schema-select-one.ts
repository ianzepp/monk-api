import type { Context } from 'hono';
import { database } from '../lib/database.js';
import { withErrorHandling } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withErrorHandling(c, async () => {
        const schemaName = c.req.param('name');
        
        // Get specific schema using database service
        const result = await database.getSchema(schemaName);
        
        if (!result) {
            throw new Error(`Schema '${schemaName}' not found`);
        }
        
        return result;
    });
}