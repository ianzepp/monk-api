/**
 * Deprecated compatibility export.
 *
 * The protected-route auth path now accepts only Monk bearer tokens.
 * Legacy API-key authentication is intentionally removed.
 */

export { authValidatorMiddleware as jwtValidatorMiddleware } from './auth-validator.js';
