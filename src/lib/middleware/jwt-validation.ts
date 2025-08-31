/**
 * JWT Token Validation Middleware
 * 
 * Verifies JWT signature and extracts payload without database validation.
 * Only validates that token is structurally valid and properly signed.
 */

import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';

interface JWTPayload {
    sub: string;
    user_id: string | null;
    tenant: string;
    database: string;
    access: string;
    access_read: string[];
    access_edit: string[];
    access_full: string[];
    iat: number;
    exp: number;
    [key: string]: any;
}

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
            throw HttpErrors.unauthorized('Authorization header required', 'TOKEN_MISSING');
        }
        
        const token = authHeader.substring(7);
        const payload = await verify(token, getJwtSecret()) as JWTPayload;
        
        // Store JWT payload and context values
        context.set('jwtPayload', payload);
        context.set('tenant', payload.tenant);
        context.set('database', payload.database);
        
        await next();
        
    } catch (error: any) {
        // Convert JWT verification errors to proper HttpErrors
        if (error.name === 'JwtTokenExpired' || error.name === 'JwtTokenInvalid' || 
            error.message?.includes('jwt') || error.message === 'Unauthorized') {
            throw HttpErrors.unauthorized('Invalid or expired token', 'TOKEN_INVALID');
        }
        
        // Re-throw HttpErrors and other errors
        throw error;
    }
}