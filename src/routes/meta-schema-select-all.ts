import type { Context } from 'hono';
import { db, schema } from '../db/index.js';
import {
    createSuccessResponse,
    createInternalError,
} from '../lib/api/responses.js';

export default async function (c: Context): Promise<any> {
    try {
        // List all schemas
        const result = await db.select().from(schema.schemas);

        return createSuccessResponse(c, result);
    } catch (error) {
        console.error('Error listing schemas:', error);
        return createInternalError(c, 'Failed to list schemas');
    }
}