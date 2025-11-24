import type { Context } from 'hono';
import { System } from '@src/lib/system.js';
import type { SystemOptions } from '@src/lib/system-context-types.js';
import type { SelectOptions } from '@src/lib/database.js';
import { isHttpError, HttpErrors } from '@src/lib/errors/http-error.js';
import { createModel } from '@src/lib/model.js';

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

// Route parameter interface for withTransactionParams() helper
interface RouteParams {
    system: System;
    model?: string;
    field?: string;
    record?: string;
    relationship?: string;
    child?: string;
    body?: any; // Content-type aware body
    method: string;
    contentType: string;
    options: SelectOptions; // Pre-extracted soft delete options
}

// ===========================
// Request Parameter Helpers
// ===========================

// Helper function to extract select options from request
function extractSelectOptionsFromContext(context: Context): SelectOptions {
    const trashedParam = context.req.query('trashed');
    const trashed = trashedParam === 'include' ? 'include' : trashedParam === 'only' ? 'only' : 'exclude';

    return {
        context: 'api',
        trashed,
    };
}

/**
 * Helper function to extract error position from JSON parsing error messages
 */
function extractPositionFromError(errorMessage: string): { line?: number; field?: number; position?: number } {
    const positionMatch = errorMessage.match(/position (\d+)/);
    const lineMatch = errorMessage.match(/line (\d+)/);
    const fieldMatch = errorMessage.match(/field (\d+)/);

    return {
        position: positionMatch ? parseInt(positionMatch[1]) : undefined,
        line: lineMatch ? parseInt(lineMatch[1]) : undefined,
        field: fieldMatch ? parseInt(fieldMatch[1]) : undefined,
    };
}

/**
 * Core transaction wrapper that handles BEGIN, SET LOCAL, COMMIT/ROLLBACK
 * Does NOT extract parameters - pure transaction lifecycle management
 *
 * Automatically handles:
 * - Transaction creation (BEGIN)
 * - Namespace isolation (SET LOCAL search_path from JWT token.ns)
 * - Transaction commit (COMMIT) on successful completion
 * - Transaction rollback (ROLLBACK) on any error
 * - Connection cleanup (release) in all cases
 * - Error formatting if route handler doesn't catch and rethrow
 *
 * All tenant-scoped routes should use this wrapper (directly or via withTransactionParams).
 * Auth routes that query the 'monk' master DB should NOT use this wrapper.
 */
export function withTransaction(handler: (context: Context) => Promise<void>) {
    return async (context: Context) => {
        const system = context.get('system');
        const nsName = context.get('nsName');  // From JWT token.ns (verified and trusted)

        // Validate namespace exists (should always exist for tenant-scoped routes)
        if (!nsName) {
            return createInternalError(context, 'Transaction started without namespace context');
        }

        // Defense in depth: validate namespace format (even though JWT is verified)
        if (!/^[a-zA-Z0-9_]+$/.test(nsName)) {
            return createInternalError(context, `Invalid namespace format: ${nsName}`);
        }

        // Acquire client from pool
        const pool = system.db;
        const tx = await pool.connect();

        try {
            // Start transaction
            await tx.query('BEGIN');

            // Set namespace isolation (transaction-scoped, reverts on COMMIT/ROLLBACK)
            await tx.query(`SET LOCAL search_path TO "${nsName}", public`);

            // Set transaction client for observers and database operations
            system.tx = tx;

            console.info('Transaction started', {
                namespace: nsName,
                path: context.req.path,
                method: context.req.method
            });

            // Execute route handler
            await handler(context);

            // Commit on success
            await tx.query('COMMIT');
            console.info('Transaction committed', { namespace: nsName });

        } catch (error) {
            // Rollback on error
            try {
                await tx.query('ROLLBACK');
                console.info('Transaction rolled back', {
                    namespace: nsName,
                    error: error instanceof Error ? error.message : String(error)
                });
            } catch (rollbackError) {
                console.warn('Failed to rollback transaction', {
                    rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                });
            }

            // If error is already an HttpError or properly formatted, rethrow it
            // Otherwise, wrap it in proper error format
            if (isHttpError(error)) {
                throw error;
            }

            // If route handler didn't catch and format the error, format it here
            return createInternalError(context, error instanceof Error ? error : String(error));

        } finally {
            // Always clean up
            tx.release();
            system.tx = undefined;
        }
    };
}

/**
 * Higher-order function that combines withTransaction with parameter extraction
 * Provides atomic transaction boundaries with convenient parameter access
 *
 * Extracts common route parameters and validates request format, then delegates
 * to withTransaction for transaction lifecycle management.
 *
 * Use for routes that need both transaction management and parameter extraction.
 * Routes that need custom parameter handling can use withTransaction directly.
 */
export function withTransactionParams(handler: (context: Context, params: RouteParams) => Promise<void>) {
    return withTransaction(async (context) => {
        // Extract all common parameters
        const params: RouteParams = {
            system: context.get('system'),
            model: context.req.param('model'),
            field: context.req.param('field'),
            record: context.req.param('record'),
            relationship: context.req.param('relationship'),
            child: context.req.param('child'),
            method: context.req.method,
            contentType: context.req.header('content-type') || 'application/json',
            body: undefined,
            options: extractSelectOptionsFromContext(context),
        };

        // Error Type 1: Content-Type header validation
        const contentTypeHeader = context.req.header('content-type');
        if (!contentTypeHeader && ['POST', 'PUT', 'PATCH'].includes(params.method)) {
            throw HttpErrors.badRequest('Missing Content-Type header', 'MISSING_CONTENT_TYPE');
        }

        // Error Type 2: Request body size validation
        if (['POST', 'PUT', 'PATCH'].includes(params.method)) {
            const contentLength = context.req.header('content-length');
            const maxSize = 10 * 1024 * 1024; // 10MB limit
            if (contentLength && parseInt(contentLength) > maxSize) {
                throw HttpErrors.requestEntityTooLarge(
                    'Request body too large',
                    'BODY_TOO_LARGE',
                    {
                        maxSize: maxSize,
                        actualSize: parseInt(contentLength)
                    }
                );
            }
        }

        // Error Type 3: Unsupported content type validation
        if (['POST', 'PUT', 'PATCH'].includes(params.method)) {
            const supportedContentTypes = [
                'application/json',
                'application/octet-stream',
                'text/plain',
                'text/html'
            ];

            const isSupported = supportedContentTypes.some(type =>
                params.contentType.includes(type)
            );

            if (!isSupported) {
                throw HttpErrors.unsupportedMediaType(
                    `Unsupported content type: ${params.contentType}`,
                    'UNSUPPORTED_CONTENT_TYPE',
                    { supportedTypes: supportedContentTypes }
                );
            }
        }

        // Error Type 4: HTTP method validation
        const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        if (!validMethods.includes(params.method)) {
            throw HttpErrors.methodNotAllowed(
                `Unsupported HTTP method: ${params.method}. Supported methods: ${validMethods.join(', ')}`,
                'UNSUPPORTED_METHOD'
            );
        }

        // Smart body handling based on content type (with enhanced error handling)
        if (['POST', 'PUT', 'PATCH'].includes(params.method)) {
            try {
                // Handle JSON content
                if (params.contentType.includes('application/json')) {
                    params.body = await context.req.json();
                }
                // Handle binary content for file uploads
                else if (params.contentType.includes('application/octet-stream')) {
                    params.body = await context.req.arrayBuffer();
                }
                // Default to text content
                else {
                    params.body = await context.req.text();
                }
            } catch (error) {
                // Enhanced JSON parsing error handling
                if (error instanceof SyntaxError && error.message.includes('JSON')) {
                    throw HttpErrors.badRequest(
                        'Invalid JSON format',
                        'JSON_PARSE_ERROR',
                        {
                            details: error.message,
                            position: extractPositionFromError(error.message)
                        }
                    );
                }

                // Handle other parsing errors (binary, text)
                if (error instanceof TypeError && error.message.includes('body')) {
                    throw HttpErrors.badRequest(
                        'Invalid request body format',
                        'INVALID_REQUEST_BODY',
                        { details: error.message }
                    );
                }

                // Re-throw other parsing errors
                throw error;
            }
        }

        // Log route operation
        const logData: any = {
            method: params.method,
            contentType: params.contentType,
        };
        if (params.model) logData.model = params.model;
        if (params.record) logData.record = params.record;
        if (params.body && Array.isArray(params.body)) logData.recordCount = params.body.length;
        console.info('Route parameters extracted', logData);

        // Execute handler with extracted params
        // Transaction is already started by withTransaction wrapper
        await handler(context, params);
    });
}

/**
 * Utility function that temporarily sets the 'as_sudo' flag for self-service operations
 * that need to bypass model-level sudo protection.
 *
 * Used by User API endpoints that allow users to modify their own records in sudo-protected
 * models (like the users table). Sets the 'as_sudo' flag which observers can check
 * alongside 'is_sudo' from JWT tokens.
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
 *     const result = await withSelfServiceSudo(context, async () => {
 *         return await system.database.updateOne('users', userId, updates);
 *     });
 *     setRouteResult(context, result);
 * });
 * ```
 */
export async function withSelfServiceSudo<T>(
    context: Context,
    handler: () => Promise<T>
): Promise<T> {
    context.set('as_sudo', true);
    try {
        return await handler();
    } finally {
        context.set('as_sudo', undefined);
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
