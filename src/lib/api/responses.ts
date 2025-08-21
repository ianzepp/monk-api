import type { Context } from 'hono';
import { System } from '../system.js';
import { DatabaseManager } from '../database-manager.js'; 
import { type TxContext } from '../../db/index.js';
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
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// Request handlers
export async function handleContextDb<T>(context: Context, fn: (system: System) => Promise<T>) {
    try {
        const contextDb = DatabaseManager.getDatabaseFromContext(context);
        const result = await fn(new System(context, contextDb));

        // Success!
        return createSuccessResponse(context, result, 200);
    } catch (error: any) {
        console.error(`Error in ${context.req.method} ${context.req.path}:`, error);
        return createErrorResponse(context, error.message || error, ApiErrorCode.INTERNAL_ERROR);
    }
}

export async function handleContextTx<T>(context: Context, fn: (system: System) => Promise<T>) {
    try {
        const contextDb = DatabaseManager.getDatabaseFromContext(context);
        const result = await contextDb.transaction(async (contextTx: TxContext) => {
            return await fn(new System(context, contextTx));
        });        

        // TODO does a failure above rollback the transaction?
        return createSuccessResponse(context, result, 200);
    } catch (error: any) {
        console.error(`Error in ${context.req.method} ${context.req.path}:`, error);
        return createErrorResponse(context, error.message || error, ApiErrorCode.INTERNAL_ERROR);
    }
}

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
    ...(data && { data })
  };
  return c.json(response, status as any);
}

export function createValidationError(c: Context, error: string, validationErrors: any[]) {
  return createErrorResponse(c, error, ApiErrorCode.VALIDATION_ERROR, 400, {
    validation_errors: validationErrors
  });
}

export function createNotFoundError(c: Context, resource: string, identifier?: string) {
  const message = identifier 
    ? `${resource} with identifier '${identifier}' not found`
    : `${resource} not found`;
  return createErrorResponse(c, message, ApiErrorCode.NOT_FOUND, 404);
}

export function createDependencyError(c: Context, resource: string, dependencies: string[]) {
  const message = `Cannot delete ${resource} - referenced by: ${dependencies.join(', ')}. Delete dependent resources first.`;
  return createErrorResponse(c, message, ApiErrorCode.DEPENDENCY_ERROR, 409, {
    dependencies
  });
}

export function createSchemaError(c: Context, error: string, details?: any) {
  return createErrorResponse(c, error, ApiErrorCode.SCHEMA_ERROR, 400, details);
}

export function createDatabaseError(c: Context, error: string = 'Database operation failed') {
  return createErrorResponse(c, error, ApiErrorCode.DATABASE_ERROR, 500);
}

export function createInternalError(c: Context, error: string = 'Internal server error') {
  return createErrorResponse(c, error, ApiErrorCode.INTERNAL_ERROR, 500);
}