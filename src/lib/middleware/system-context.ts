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
 * Attaches system to context.set('system', system) for use in route handlers.
 * Provides global error handling with proper error categorization.
 * Handles automatic response formatting for successful operations.
 */
export async function systemContextMiddleware(context: Context, next: Next) {
    try {
        // Initialize database context from JWT/auth
        const dtx = DatabaseManager.getDatabaseFromContext(context);
        
        if (!dtx) {
            return createInternalError(context, 'Unable to initialize database context');
        }
        
        // Create System instance for this request
        const system = new System(context, dtx);
        
        // Attach system to Hono context for route handler access
        context.set('system', system);
        
        console.debug(`🔧 System context initialized for request: ${context.req.method} ${context.req.url}`);
        
        // Execute route handler
        await next();
        
    } catch (error) {
        // Global error handling with proper categorization
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
 * Meta API routes handle their own YAML formatting via SchemaMetaYAML methods,
 * so this middleware is mainly for consistency and future YAML auto-formatting.
 */
export async function responseYamlMiddleware(context: Context, next: Next) {
    await next();
    
    // Meta API routes use SchemaMetaYAML methods that return Response objects directly
    // This middleware could be enhanced in the future for automatic YAML formatting
    // if route handlers start returning raw data instead of Response objects
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
 * Meta API routes should continue using SchemaMetaYAML methods directly.
 */
export function setRouteResult(context: Context, result: any) {
    context.set('routeResult', result);
}