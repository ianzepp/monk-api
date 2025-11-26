/**
 * JWT System Init Middleware
 *
 * Verifies JWT signature and extracts payload without database validation.
 * Only validates that token is structurally valid and properly signed.
 * Creates SystemInit for use by System class.
 */

import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { systemInitFromJWT } from '@src/lib/system.js';
import type { JWTPayload } from '@src/lib/jwt-generator.js';

function getJwtSecret(): string {
    return process.env['JWT_SECRET']!;
}

/**
 * JWT validation middleware - verifies token signature and extracts payload
 * 
 * Only validates token integrity, does not check user/tenant existence.
 * Sets JWT context values for subsequent middleware to use.
 */
export async function jwtValidationMiddleware(context: Context, next: Next) {
    try {
        const authHeader = context.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw HttpErrors.unauthorized('Authorization token required', 'AUTH_TOKEN_REQUIRED');
        }

        const token = authHeader.substring(7);
        const payload = await verify(token, getJwtSecret()) as JWTPayload;

        // Store JWT payload for middleware that needs raw payload access
        context.set('jwtPayload', payload);

        // Create SystemInit from JWT for System class initialization
        // This is the canonical source of auth context for the request
        const correlationId = context.req.header('x-request-id');
        const systemInit = systemInitFromJWT(payload, correlationId || undefined);
        context.set('systemInit', systemInit);

        // Legacy context values for backwards compatibility
        // TODO: Migrate middleware to use systemInit directly
        context.set('tenant', payload.tenant);
        context.set('dbType', systemInit.dbType);
        context.set('dbName', systemInit.dbName);
        context.set('nsName', systemInit.nsName);

        return await next();

    } catch (error: any) {
        // Convert JWT verification errors to proper HttpErrors with specific error codes

        // Token expired - can be refreshed
        if (error.name === 'JwtTokenExpired') {
            throw HttpErrors.unauthorized('Token has expired', 'AUTH_TOKEN_EXPIRED');
        }

        // Token invalid - malformed or bad signature
        if (error.name === 'JwtTokenInvalid' || error.message?.includes('jwt') || error.message === 'Unauthorized') {
            throw HttpErrors.unauthorized('Invalid token', 'AUTH_TOKEN_INVALID');
        }

        // Re-throw HttpErrors and other errors
        throw error;
    }
}