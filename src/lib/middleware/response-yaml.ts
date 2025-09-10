/**
 * JSON Response Middleware
 *
 * Automatically formats route results as JSON responses and handles errors consistently.
 */

import type { Context, Next } from 'hono';

/**
 * JSON response middleware for /api/describe/* routes
 *
 * Automatically formats route results as JSON responses and handles errors consistently.
 */
export async function responseYamlMiddleware(context: Context, next: Next) {
    try {
        await next();

        // Check if route handler set a result for JSON formatting
        const routeResult = context.get('routeResult');

        if (routeResult !== undefined && !context.res.body) {
            // Auto-format as JSON response
            return new Response(routeResult, {
                headers: { 'Content-Type': 'application/json' },
            });
        }
    } catch (error) {
        // Consistent error handling for all describe operations
        console.error(`Describe API error: ${context.req.method} ${context.req.path}`, error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Describe operation failed',
            }),
            {
                headers: { 'Content-Type': 'application/json' },
                status: error instanceof Error && error.message.includes('not found') ? 404 : 400,
            }
        );
    }
}
