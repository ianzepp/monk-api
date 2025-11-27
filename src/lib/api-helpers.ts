import type { Context } from 'hono';
import { System, type SystemInit } from '@src/lib/system.js';
import { isHttpError } from '@src/lib/errors/http-error.js';
import { runTransaction } from '@src/lib/transaction.js';

/**
 * API Request/Response Helpers
 *
 * Combined utilities for API route handling including parameter extraction,
 * content-type processing, error handling, and response formatting.
 */

// ===========================
// Response Types & Interfaces
// ===========================

export interface ApiSuccessResponse<T = any> {
    success: true;
    data: T;
}

export interface ApiErrorResponse {
    success: false;
    error: string;
    error_code: ApiErrorCode;
    data?: {
        validation_errors?: any[];
        dependencies?: string[];
        [key: string]: any;
    };
}

export enum ApiErrorCode {
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    NOT_FOUND = 'NOT_FOUND',
    DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
    MODEL_ERROR = 'MODEL_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
    MISSING_CONTENT_TYPE = 'MISSING_CONTENT_TYPE',
    BODY_TOO_LARGE = 'BODY_TOO_LARGE',
    UNSUPPORTED_CONTENT_TYPE = 'UNSUPPORTED_CONTENT_TYPE',
    UNSUPPORTED_METHOD = 'UNSUPPORTED_METHOD',
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// Route parameter interface for withTransaction() helper
export interface RouteParams {
    system: System;
    params: Record<string, string>;   // Dynamic route params (:model, :id, etc)
    query: Record<string, string>;    // Query string params (?foo=bar)
    body?: any;                       // Parsed request body
    method: string;                   // HTTP method (GET, POST, PUT, etc)
}

// Route handler type - pure function that returns result
type RouteHandler = (params: RouteParams) => Promise<any>;

/**
 * Transaction wrapper that provides clean route handler interface
 *
 * Routes receive { system, params, query, body } and return their result.
 * The wrapper handles transaction lifecycle and response formatting.
 *
 * Automatically handles:
 * - Database adapter creation based on JWT db_type (postgresql or sqlite)
 * - Transaction creation (BEGIN)
 * - Namespace isolation (SET LOCAL search_path for PostgreSQL)
 * - Transaction commit (COMMIT) on successful completion
 * - Transaction rollback (ROLLBACK) on any error
 * - Connection cleanup (disconnect) in all cases
 * - Setting route result from handler return value
 * - Error formatting if route handler throws
 *
 * All tenant-scoped routes should use this wrapper.
 * Auth routes that query the 'monk' master DB should NOT use this wrapper.
 */
export function withTransaction(handler: RouteHandler) {
    return async (context: Context) => {
        const systemInit = context.get('systemInit') as SystemInit;

        // Validate we have system init (should be set by jwt-validator middleware)
        if (!systemInit) {
            return createInternalError(context, 'Transaction started without systemInit context');
        }

        // Defense in depth: validate namespace format (even though JWT is verified)
        if (!/^[a-zA-Z0-9_]+$/.test(systemInit.nsName)) {
            return createInternalError(context, `Invalid namespace format: ${systemInit.nsName}`);
        }

        try {
            await runTransaction(systemInit, async (system) => {
                // Build route params
                const routeParams: RouteParams = {
                    system,
                    params: context.req.param() as Record<string, string>,
                    query: context.req.query() as Record<string, string>,
                    body: context.get('parsedBody'),
                    method: context.req.method,
                };

                // Execute handler and capture result
                const result = await handler(routeParams);

                // Set route result for response pipeline
                if (result !== undefined) {
                    context.set('routeResult', result);
                }
            }, {
                logContext: {
                    path: context.req.path,
                    method: context.req.method,
                },
            });

        } catch (error) {
            // If error is already an HttpError, rethrow for error handler
            if (isHttpError(error)) {
                throw error;
            }

            // Format unexpected errors for API response
            return createInternalError(context, error instanceof Error ? error : String(error));
        }
    };
}


/**
 * Utility function that temporarily sets the 'as_sudo' flag for self-service operations
 * that need to bypass model-level sudo protection.
 *
 * Used by User API endpoints that allow users to modify their own records in sudo-protected
 * models (like the users table). Sets the 'as_sudo' flag on System which observers check
 * via system.isSudo().
 *
 * Automatically handles:
 * - Setting as_sudo=true flag before handler execution
 * - Cleaning up as_sudo flag after completion (even on errors)
 * - Returns the handler's return value
 *
 * Security: Only use for controlled self-service operations where business logic
 * ensures users can only modify their own records.
 *
 * Example usage:
 * ```typescript
 * export default withTransactionParams(async (context, { system, body }) => {
 *     const result = await withSelfServiceSudo(system, async () => {
 *         return await system.database.updateOne('users', userId, updates);
 *     });
 *     setRouteResult(context, result);
 * });
 * ```
 */
export async function withSelfServiceSudo<T>(
    system: System,
    handler: () => Promise<T>
): Promise<T> {
    system.setAsSudo(true);
    try {
        return await handler();
    } finally {
        system.setAsSudo(false);
    }
}

// Error handling wrapper - keeps business logic in handlers
export async function withErrorHandling<T>(c: Context, handler: () => Promise<T>, successStatus: number = 200): Promise<any> {
    const model = c.req.param('model');
    const record = c.req.param('record');

    try {
        const result = await handler();
        return createSuccessResponse(c, result, successStatus);
    } catch (error) {
        console.error('Route handler error:', error);
        if (error instanceof Error) {
            if (error.message.includes('Model') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Model', model);
            }
            if (error.message.includes('Record') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Record', record);
            }
        }
        return createInternalError(c, 'Route operation failed');
    }
}

// ===========================
// Response Helpers
// ===========================

/**
 * Success response helpers
 *
 * IMPORTANT: context.json() may be transparently overridden by responseFormatterMiddleware
 * to encode responses in TOON/YAML/etc based on ?format query parameter or JWT preference.
 *
 * Routes always work with JSON - formatters operate at the API boundary transparently.
 * Default format is JSON (no overhead for 99% of requests).
 */
export function createSuccessResponse<T>(c: Context, data: T, status = 200) {
    return c.json({ success: true, data } as ApiSuccessResponse<T>, status as any);
}

// Error response helpers
export function createErrorResponse(c: Context, error: string, errorCode: ApiErrorCode, status = 400, data?: any) {
    const response: ApiErrorResponse = {
        success: false,
        error,
        error_code: errorCode,
        ...(data && { data }),
    };
    return c.json(response, status as any);
}

export function createValidationError(c: Context, error: string, validationErrors: any[]) {
    return createErrorResponse(c, error, ApiErrorCode.VALIDATION_ERROR, 400, {
        validation_errors: validationErrors,
    });
}

export function createNotFoundError(c: Context, resource: string, identifier?: string) {
    const message = identifier ? `${resource} with identifier '${identifier}' not found` : `${resource} not found`;
    return createErrorResponse(c, message, ApiErrorCode.NOT_FOUND, 404);
}

export function createDependencyError(c: Context, resource: string, dependencies: string[]) {
    const message = `Cannot delete ${resource} - referenced by: ${dependencies.join(', ')}. Delete dependent resources first.`;
    return createErrorResponse(c, message, ApiErrorCode.DEPENDENCY_ERROR, 409, {
        dependencies,
    });
}

export function createModelError(c: Context, error: string, details?: any) {
    return createErrorResponse(c, error, ApiErrorCode.MODEL_ERROR, 400, details);
}

export function createDatabaseError(c: Context, error: string = 'Database operation failed') {
    return createErrorResponse(c, error, ApiErrorCode.DATABASE_ERROR, 500);
}

export function createInternalError(c: Context, error: string | Error = 'Internal server error') {
    console.error('Unhandled error:', error);

    // Start processing
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Handle HttpError instances with proper status codes
    if (isHttpError(error)) {
        let responseData = error.details;

        // Add stack trace in development mode
        if (isDevelopment) {
            responseData = {
                ...responseData,
                name: error.name,
                stack: error.stack,
                cause: error.cause,
            };
        }

        return c.json(
            {
                success: false,
                error: error.message,
                error_code: error.errorCode,
                ...(responseData && { data: responseData }),
            },
            error.statusCode as any
        );
    }

    // Handle generic Error instances
    let errorMessage: string;
    let errorData: any = undefined;

    if (error instanceof Error) {
        errorMessage = error.message;
        if (isDevelopment) {
            errorData = {
                name: error.name,
                stack: error.stack,
                cause: error.cause,
            };
        }
    } else {
        errorMessage = error;
    }

    return createErrorResponse(c, errorMessage, ApiErrorCode.INTERNAL_ERROR, 500, errorData);
}
