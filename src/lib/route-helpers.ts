import type { Context } from 'hono';
import { createSchema } from '@src/lib/schema.js';
import type { System } from '@src/lib/system.js';
import {
    createSuccessResponse,
    createNotFoundError,
    createInternalError,
} from '@src/lib/api/responses.js';

/**
 * Route handler utilities to reduce boilerplate while keeping logic visible
 */

// Route parameter interface for withParams() helper
interface RouteParams {
    system: System;
    schema?: string;
    schemaName?: string; 
    recordId?: string;
    name?: string;
    body?: any;          // Content-type aware body
    method: string;
    contentType: string;
}

/**
 * Higher-order function that pre-extracts common route parameters
 * Eliminates boilerplate while keeping business logic visible in route handlers
 * 
 * Handles content-type aware body parsing:
 * - application/json → parsed JSON object
 * - text/yaml → raw YAML string  
 * - application/octet-stream → ArrayBuffer for binary data
 * - default → raw text string
 */
export function withParams(
    handler: (context: Context, params: RouteParams) => Promise<void>
) {
    return async (context: Context) => {
        // Extract all common parameters
        const params: RouteParams = {
            system: context.get('system'),
            schema: context.req.param('schema'),
            schemaName: context.req.param('name') || context.req.param('schema'),
            recordId: context.req.param('id'), 
            name: context.req.param('name'),
            method: context.req.method,
            contentType: context.req.header('content-type') || 'application/json',
            body: undefined
        };
        
        // Smart body handling based on content type
        if (['POST', 'PUT', 'PATCH'].includes(params.method)) {
            if (params.contentType.includes('application/json')) {
                params.body = await context.req.json();        // Parsed JSON
            } else if (params.contentType.includes('text/yaml') || params.contentType.includes('application/yaml')) {
                params.body = await context.req.text();        // Raw YAML string
            } else if (params.contentType.includes('application/octet-stream')) {
                params.body = await context.req.arrayBuffer();  // Binary for /api/file
            } else {
                params.body = await context.req.text();        // Default to text
            }
        }
        
        await handler(context, params);
    };
}

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
