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
import { System } from '@lib/system.js';
import { DatabaseManager } from '@lib/database-manager.js';
import { 
    createSuccessResponse, 
    createValidationError, 
    createInternalError 
} from '@lib/api/responses.js';
import { 
    ValidationError, 
    BusinessLogicError, 
    SystemError 
} from '@lib/observers/errors.js';

/**
 * System context middleware - sets up System instance and global error handling
 * 
 * Only applies to /api/* routes that require authenticated database context.
 * Skips /ping, /auth, and other public endpoints that don't need System context.
 * 
 * Attaches system to context.set('system', system) for use in route handlers.
 * Provides global error handling with proper error categorization.
 */
export async function systemContextMiddleware(context: Context, next: Next) {
    try {
        // Initialize database context from JWT/auth
        const dtx = DatabaseManager.getDatabaseFromContext(context);
        
        if (!dtx) {
            return createInternalError(context, 'Unable to initialize database context');
        }
        
        // Extract system options from query parameters
        const options = {
            trashed: context.req.query('include_trashed') === 'true',
            deleted: context.req.query('include_deleted') === 'true'
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
 * JSON response middleware for /api/data/* routes
 * 
 * Automatically formats route results as JSON API responses using createSuccessResponse()
 */
export async function responseJsonMiddleware(context: Context, next: Next) {
    await next();
    
    // Check if route handler set a result for JSON formatting
    const routeResult = context.get('routeResult');
    
    if (routeResult !== undefined && !context.res.body) {
        return createSuccessResponse(context, routeResult);
    }
}

/**
 * YAML response middleware for /api/meta/* routes
 * 
 * Automatically formats route results as YAML responses and handles errors consistently.
 */
export async function responseYamlMiddleware(context: Context, next: Next) {
    try {
        await next();
        
        // Check if route handler set a result for YAML formatting
        const routeResult = context.get('routeResult');
        
        if (routeResult !== undefined && !context.res.body) {
            // Auto-format as YAML response
            return new Response(routeResult, {
                headers: { 'Content-Type': 'text/yaml' }
            });
        }
    } catch (error) {
        // Consistent error handling for all meta operations
        console.error(`Meta API error: ${context.req.method} ${context.req.path}`, error);
        
        return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Meta operation failed'
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: error instanceof Error && error.message.includes('not found') ? 404 : 400
        });
    }
}

/**
 * File response middleware for future /api/file/* routes
 * 
 * Placeholder for file upload/download response formatting
 */
export async function responseFileMiddleware(context: Context, next: Next) {
    await next();
    
    // Future: Handle file responses, content-type headers, streaming, etc.
    // Could format file metadata, handle multipart responses, etc.
}

/**
 * Helper for route handlers to set their result for automatic formatting
 * 
 * Use this for data API routes that should be JSON formatted.
 * Meta API routes use system.metabase methods with automatic YAML formatting.
 */
export function setRouteResult(context: Context, result: any) {
    context.set('routeResult', result);
}