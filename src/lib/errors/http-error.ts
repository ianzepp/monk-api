/**
 * HttpError - Structured HTTP error handling for API responses
 * 
 * IMPLEMENTATION PLAN:
 * 
 * Phase 1: Core Error Class
 * - Create HttpError class extending Error
 * - Add statusCode, errorCode properties
 * - Export common error factory methods
 * 
 * Phase 2: Update Metabase Operations
 * - Replace all 'throw new Error()' calls in metabase.ts with HttpError
 * - Map business logic errors to appropriate HTTP status codes:
 *   - 400: Schema validation, parsing, required field errors
 *   - 403: Protected schema modification attempts  
 *   - 404: Schema not found errors
 *   - 409: Schema already exists (if applicable)
 *   - 422: Invalid schema content/structure
 * 
 * Phase 3: Update Middleware
 * - Modify responseYamlMiddleware in system-context.ts
 * - Add instanceof HttpError detection
 * - Use error.statusCode for HTTP response status
 * - Include error.errorCode in JSON error response
 * - Keep 500 default for unexpected Error instances
 * 
 * Phase 4: Extend to Other APIs (Future)
 * - Apply HttpError pattern to data API routes
 * - Apply to auth API routes
 * - Standardize error response format across all APIs
 * 
 * Phase 5: Enhanced Error Context (Future)
 * - Add validation details for schema errors
 * - Add request context (tenant, user, operation)
 * - Add correlation IDs for error tracking
 */

/**
 * Structured HTTP error for API responses
 * 
 * Separates business logic errors from HTTP transport concerns.
 * Business logic throws semantic errors, middleware handles HTTP details.
 */
export class HttpError extends Error {
    public readonly name = 'HttpError';
    
    constructor(
        public readonly statusCode: number,
        message: string,
        public readonly errorCode?: string,
        public readonly details?: Record<string, any>
    ) {
        super(message);
        
        // Maintain proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, HttpError.prototype);
    }
    
    /**
     * Convert to JSON-serializable object for API responses
     */
    toJSON() {
        return {
            success: false,
            error: this.message,
            error_code: this.errorCode,
            status_code: this.statusCode,
            ...(this.details && { details: this.details })
        };
    }
}

/**
 * Factory methods for common HTTP error scenarios
 */
export class HttpErrors {
    static badRequest(message: string, errorCode = 'BAD_REQUEST', details?: Record<string, any>) {
        return new HttpError(400, message, errorCode, details);
    }
    
    static unauthorized(message = 'Unauthorized', errorCode = 'UNAUTHORIZED') {
        return new HttpError(401, message, errorCode);
    }
    
    static forbidden(message = 'Forbidden', errorCode = 'FORBIDDEN') {
        return new HttpError(403, message, errorCode);
    }
    
    static notFound(message = 'Not found', errorCode = 'NOT_FOUND') {
        return new HttpError(404, message, errorCode);
    }
    
    static conflict(message: string, errorCode = 'CONFLICT', details?: Record<string, any>) {
        return new HttpError(409, message, errorCode, details);
    }
    
    static unprocessableEntity(message: string, errorCode = 'UNPROCESSABLE_ENTITY', details?: Record<string, any>) {
        return new HttpError(422, message, errorCode, details);
    }
    
    static internal(message = 'Internal server error', errorCode = 'INTERNAL_ERROR') {
        return new HttpError(500, message, errorCode);
    }
}

/**
 * Type guard for HttpError instances
 */
export function isHttpError(error: unknown): error is HttpError {
    return error instanceof HttpError;
}