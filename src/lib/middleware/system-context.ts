/**
 * System Context Middleware
 *
 * Hono middleware that initializes System context and attaches it to the request context.
 * Provides global error handling and automatic response formatting.
 *
 * This middleware eliminates the need for handleContextDb/handleContextTx wrapper functions
 * by doing all the system setup once per request and making it available on context.system.
 */

import type { Context, Next } from 'hono';
import { System } from '@src/lib/system.js';
import { createValidationError, createInternalError } from '@src/lib/api-helpers.js';
import { ValidationError, BusinessLogicError, SystemError } from '@src/lib/observers/errors.js';

/**
 * System context middleware - sets up System instance and global error handling
 *
 * Attaches system to context.set('system', system) for use in route handlers.
 * Provides global error handling with proper error categorization.
 */
export async function systemContextMiddleware(context: Context, next: Next) {
    try {
        // Extract system options from query parameters
        const options = {
            trashed: context.req.query('include_trashed') === 'true',
            deleted: context.req.query('include_deleted') === 'true',
        };

        // Create System instance for this request
        const system = new System(context, options);

        // Attach system to Hono context for route handler access
        context.set('system', system);

        console.debug(`🔧 System context initialized for request: ${context.req.method} ${context.req.url}`);

        // Execute route handler
        await next();
    } catch (error) {
        // Global error handling with proper error categorization
        console.error(`💥 Request failed: ${context.req.method} ${context.req.url}`, error);

        if (error instanceof ValidationError) {
            return createValidationError(context, error.message, []);
        } else if (error instanceof BusinessLogicError) {
            return createValidationError(context, error.message, []);
        } else if (error instanceof SystemError) {
            return createInternalError(context, error.message);
        } else if (error instanceof Error) {
            return createInternalError(context, error.message);
        } else {
            return createInternalError(context, 'Unknown error occurred');
        }
    }
}

/**
 * Helper for route handlers to set their result for automatic formatting
 *
 * Use this for data API routes that should be JSON formatted.
 * Describe API routes use system.describe methods with automatic JSON formatting.
 */
export function setRouteResult(context: Context, result: any) {
    context.set('routeResult', result);
}
