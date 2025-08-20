import type { Context } from 'hono';
import { database } from '../lib/database.js';
import { withErrorHandling } from '../lib/route-helpers.js';

export default async function (c: Context): Promise<any> {
    return withErrorHandling(c, async () => {
        const schemaName = c.req.param('schema');
        return database.selectAny(schemaName);
    });
}
