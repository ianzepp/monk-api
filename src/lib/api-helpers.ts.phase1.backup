import type { Context } from 'hono';
import { System } from '@src/lib/system.js';
import type { SystemOptions } from '@src/lib/system-context-types.js';
import type { SelectOptions } from '@src/lib/database.js';
import { isHttpError } from '@src/lib/errors/http-error.js';
import { createSchema } from '@src/lib/schema.js';

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
    SCHEMA_ERROR = 'SCHEMA_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// Route parameter interface for withParams() helper
interface RouteParams {
    system: System;
    schema?: string;
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
    return {
        context: 'api',
        includeTrashed: context.req.query('include_trashed') === 'true',
        includeDeleted: context.req.query('include_deleted') === 'true',
    };
}

/**
 * Higher-order function that pre-extracts common route parameters
 * Eliminates boilerplate while keeping business logic visible in route handlers
 *
 * Handles content-type aware body parsing:
 * - application/json → parsed JSON object
 * - application/octet-stream → ArrayBuffer for binary data
 * - default → raw text string
 */
export function withParams(handler: (context: Context, params: RouteParams) => Promise<void>) {
    return async (context: Context) => {
        // Extract all common parameters
        const params: RouteParams = {
            system: context.get('system'),
            schema: context.req.param('schema'),
            record: context.req.param('record'),
            relationship: context.req.param('relationship'),
            child: context.req.param('child'),
            method: context.req.method,
            contentType: context.req.header('content-type') || 'application/json',
            body: undefined,
            options: extractSelectOptionsFromContext(context),
        };

        // Smart body handling based on content type
        if (['POST', 'PUT', 'PATCH'].includes(params.method)) {
            // Handle JSON content
            if (params.contentType.includes('application/json')) {
                params.body = await context.req.json(); // Parsed JSON
            }

            // Handle binary content for file uploads
            else if (params.contentType.includes('application/octet-stream')) {
                params.body = await context.req.arrayBuffer(); // Binary for /api/file
            }

            // Default to text content
            else {
                params.body = await context.req.text(); // Default to text
            }
        }

        // Log route operation with complete context
        const logData: any = {
            method: params.method,
            contentType: params.contentType,
        };

        // Add relevant parameters to log
        if (params.schema) logData.schema = params.schema;
        if (params.record) logData.record = params.record;
        if (params.body && Array.isArray(params.body)) logData.recordCount = params.body.length;

        logger.info('Route operation', logData);

        await handler(context, params);
    };
}

/**
 * Higher-order function that wraps withParams with automatic transaction management
 * Provides atomic transaction boundaries for modification operations
 *
 * Automatically handles:
 * - Transaction creation (BEGIN) if not already in transaction
 * - Transaction commit (COMMIT) on successful completion
 * - Transaction rollback (ROLLBACK) on any error
 * - Connection cleanup (release) in all cases
 *
 * Use for routes that perform write operations requiring atomicity.
 * Read-only routes should use withParams instead.
 */
export function withTransactionParams(handler: (context: Context, params: RouteParams) => Promise<void>) {
    return withParams(async (context, params) => {
        const { system } = params;

        // Always start transaction (only routes call withTransactionParams)
        const pool = system.db;
        const tx = await pool.connect();
        await tx.query('BEGIN');
        system.tx = tx;

        logger.info('Transaction started for route', {
            method: params.method,
            schema: params.schema,
            record: params.record
        });

        try {
            // Execute route handler - observers and database operations will use system.tx
            await handler(context, params);

            // Always commit (we always start the transaction)
            await tx.query('COMMIT');
            logger.info('Transaction committed successfully', {
                method: params.method,
                schema: params.schema
            });

        } catch (error) {
            // Always rollback on error (we always start the transaction)
            try {
                await tx.query('ROLLBACK');
                logger.info('Transaction rolled back due to error', {
                    method: params.method,
                    schema: params.schema,
                    error: error instanceof Error ? error.message : String(error)
                });
            } catch (rollbackError) {
                logger.warn('Failed to rollback transaction', {
                    rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                });
            }

            throw error; // Re-throw original error

        } finally {
            // Always clean up (we always start the transaction)
            tx.release(); // Release connection back to pool
            system.tx = undefined; // Clear transaction context
        }
    });
}

// Error handling wrapper - keeps business logic in handlers
export async function withErrorHandling<T>(c: Context, handler: () => Promise<T>, successStatus: number = 200): Promise<any> {
    const schema = c.req.param('schema');
    const record = c.req.param('record');

    try {
        const result = await handler();
        return createSuccessResponse(c, result, successStatus);
    } catch (error) {
        console.error('Route handler error:', error);
        if (error instanceof Error) {
            if (error.message.includes('Schema') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Schema', schema);
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

// Success response helpers
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

export function createSchemaError(c: Context, error: string, details?: any) {
    return createErrorResponse(c, error, ApiErrorCode.SCHEMA_ERROR, 400, details);
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
