/**
 * JSON Response Middleware
 *
 * Automatically formats route results as JSON responses and handles errors consistently.
 */

import type { Context, Next } from 'hono';

/**
 * JSON response middleware for /api/meta/* routes
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
        // Consistent error handling for all meta operations
        console.error(`Meta API error: ${context.req.method} ${context.req.path}`, error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Meta operation failed',
            }),
            {
                headers: { 'Content-Type': 'application/json' },
                status: error instanceof Error && error.message.includes('not found') ? 404 : 400,
            }
        );
    }
}
