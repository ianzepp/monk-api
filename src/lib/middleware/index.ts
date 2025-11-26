/**
 * Middleware Barrel Export
 *
 * Clean middleware organization for Hono route handling:
 * - System context and error handling
 * - Response pipeline (field extraction, formatting, encryption)
 * - Request parsing and authentication
 */

export { systemContextMiddleware, setRouteResult } from './system-context.js';
export { formatDetectionMiddleware } from './format-detection.js';
export { requestBodyParserMiddleware } from './request-body-parser.js';
export { responsePipelineMiddleware } from './response-pipeline.js';
export { requestTrackingMiddleware } from './request-tracking.js';
export { jwtValidationMiddleware } from './jwt-system-init.js';
export { userValidationMiddleware } from './user-validation.js';
export { sudoAccessMiddleware } from './sudo-access.js';
