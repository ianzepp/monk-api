/**
 * System Context Middleware
 *
 * Hono middleware that initializes System context and attaches it to the request context.
 * Provides global error handling and automatic response formatting.
 *
 * Requires jwtValidationMiddleware and userValidationMiddleware to run first
 * to populate context.systemInit with authentication data.
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
 * Uses systemInit from context (set by jwtValidationMiddleware, enriched by userValidationMiddleware).
 */
export async function systemContextMiddleware(context: Context, next: Next) {
    try {
        // Extract system options from query parameters
        const options = {
            trashed: context.req.query('include_trashed') === 'true',
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

        // Check if route set a result via setRouteResult() without creating a response
        const routeResult = context.get('routeResult');
        if (routeResult !== undefined) {
            // Route used setRouteResult() pattern - create response
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

/**
 * Helper for route handlers to set their result for automatic response creation
 *
 * Routes using this pattern don't call context.json() directly - instead they store
 * the result data and let systemContextMiddleware create the response. This response
 * will be transparently formatted by responseFormatterMiddleware if a non-JSON format
 * is requested via ?format query parameter.
 *
 * Example usage:
 *   export default withTransactionParams(async (context, { system, model, record, options }) => {
 *       const result = await system.database.select404(model, { where: { id: record } });
 *       setRouteResult(context, result);  // Don't return - middleware handles response
 *   });
 *
 * The response will be:
 *   - JSON by default (99% of requests)
 *   - TOON/YAML/etc when ?format=toon is specified (transparent to route logic)
 */
export function setRouteResult(context: Context, result: any) {
    context.set('routeResult', result);
}
