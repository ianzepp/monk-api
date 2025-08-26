import type { Context } from 'hono';
import { createSchema } from '@src/lib/schema.js';
import {
    createSuccessResponse,
    createNotFoundError,
    createInternalError,
} from '@src/lib/api/responses.js';

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
