import type { Context } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import {
    createSuccessResponse,
    createNotFoundError,
    createInternalError,
} from '../lib/api/responses.js';

export default async function (c: Context): Promise<any> {
    const schemaName = c.req.param('name');

    try {
        // Get specific schema
        const result = await db
            .select()
            .from(schema.schemas)
            .where(eq(schema.schemas.name, schemaName))
            .limit(1);

        if (result.length === 0) {
            return createNotFoundError(c, 'Schema', schemaName);
        }

        return createSuccessResponse(c, result[0]);
    } catch (error) {
        console.error('Error getting schema:', error);
        return createInternalError(c, 'Failed to get schema');
    }
}