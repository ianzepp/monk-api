import type { Context } from 'hono';
import { createSchema } from './schema.js';
import { database } from './database.js';
import {
    createSuccessResponse,
    createNotFoundError,
    createInternalError,
} from './api/responses.js';

/**
 * Route handler utilities to reduce boilerplate while keeping logic visible
 */

// Error handling wrapper - keeps business logic in handlers
export async function withErrorHandling<T>(
    c: Context,
    handler: () => Promise<T>,
    successStatus: number = 200
): Promise<any> {
    const schemaName = c.req.param('schema');
    const recordId = c.req.param('id');

    try {
        const result = await handler();
        return createSuccessResponse(c, result, successStatus);
    } catch (error) {
        console.error('Route handler error:', error);
        if (error instanceof Error) {
            if (error.message.includes('Schema') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Schema', schemaName);
            }
            if (error.message.includes('Record') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Record', recordId);
            }
        }
        return createInternalError(c, 'Route operation failed');
    }
}

// Transaction wrapper for write operations - keeps handler logic visible
export async function withTransaction<T>(
    c: Context,
    handler: (tx: any) => Promise<T>,
    successStatus: number = 200
): Promise<any> {
    return withErrorHandling(c, async () => {
        return await database.transaction(handler, c);
    }, successStatus);
}