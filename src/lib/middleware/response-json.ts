/**
 * JSON Response Middleware
 * 
 * Automatically formats route results as JSON API responses using createSuccessResponse()
 */

import type { Context, Next } from 'hono';
import { createSuccessResponse } from '@src/lib/api-helpers.js';

/**
 * JSON response middleware for /api/data/* routes
 * 
 * Automatically formats route results as JSON API responses using createSuccessResponse()
 */
export async function responseJsonMiddleware(context: Context, next: Next) {
    await next();
    
    // Check if route handler set a result for JSON formatting
    const routeResult = context.get('routeResult');
    
    if (routeResult !== undefined && !context.res.body) {
        // Check if total count was requested (for pagination)
        const routeTotal = context.get('routeTotal');
        
        if (routeTotal !== undefined) {
            // Include total count in response
            return context.json({ 
                success: true, 
                data: routeResult,
                total: routeTotal
            }, 200);
        }
        
        return createSuccessResponse(context, routeResult);
    }
}