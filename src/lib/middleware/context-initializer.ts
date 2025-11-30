/**
 * System Context Middleware
 *
 * Hono middleware that initializes System context and attaches it to the request context.
 * Provides global error handling and automatic response formatting.
 *
 * Requires authValidatorMiddleware to run first to populate context.systemInit
 * with authentication data.
 */

import type { Context, Next } from 'hono';
import { System, type SystemInit } from '@src/lib/system.js';
import { createValidationError, createInternalError } from '@src/lib/api-helpers.js';
import { ValidationError, BusinessLogicError, SystemError } from '@src/lib/observers/errors.js';

/**
 * System context middleware - sets up System instance and global error handling
 *
 * Attaches system to context.set('system', system) for use in route handlers.
 * Provides global error handling with proper error categorization.
 *
 * Uses systemInit from context (set by authValidatorMiddleware).
 */
export async function contextInitializerMiddleware(context: Context, next: Next) {
    try {
        // Extract system options from query parameters
        // Note: trashed option removed from URL - use /api/trashed endpoint instead
        // Note: deleted option is admin-only for permanent delete operations
        const options = {
            deleted: context.req.query('include_deleted') === 'true',
        };

        // Get systemInit from context (set by jwt-system-init, enriched by user-validation)
        const systemInit = context.get('systemInit') as SystemInit | undefined;

        // Create System instance - prefer systemInit, fallback to legacy context constructor
        const system = systemInit
            ? new System(systemInit, options)
            : new System(context, options);

        // Attach system to Hono context for route handler access
        context.set('system', system);

        console.debug(`🔧 System context initialized for request: ${context.req.method} ${context.req.url}`);

        // Execute route handler
        const result = await next();

        // If handler created and finalized a response, return it
        if (context.finalized) {
            return result;
        }

        // Check if route set a result via withTransaction() return value
        const routeResult = context.get('routeResult');
        if (routeResult !== undefined) {
            // Route returned a result - create response
            const routeTotal = context.get('routeTotal');
            const responseData = {
                success: true,
                data: routeResult,
                ...(routeTotal !== undefined && { total: routeTotal })
            };

            // Note: Field extraction (?unwrap, ?select=) is handled by fieldExtractionMiddleware
            // which runs after this middleware in the response chain

            return context.json(responseData, 200);
        }

        return result;
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

