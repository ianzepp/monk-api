/**
 * JWT Token Validation Middleware
 * 
 * Verifies JWT signature and extracts payload without database validation.
 * Only validates that token is structurally valid and properly signed.
 */

import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export interface JWTPayload {
    sub: string;
    user_id: string | null;
    tenant: string;
    db_type: 'postgresql' | 'sqlite'; // Database backend type
    db: string; // Database name (PG) or directory (SQLite)
    ns: string; // Namespace/schema name (PG) or filename (SQLite)
    access: string;
    access_read: string[];
    access_edit: string[];
    access_full: string[];
    iat: number;
    exp: number;
    // Sudo elevation metadata (optional)
    is_sudo?: boolean; // True if this is a short-lived sudo token
    elevated_from?: string; // Original access level before sudo
    elevated_at?: string; // When sudo was granted
    elevation_reason?: string; // Why sudo was requested
    // User impersonation metadata (optional)
    is_fake?: boolean; // True if this is a fake/impersonation token
    faked_by_user_id?: string; // ID of root user doing the faking
    faked_by_username?: string; // Name of root user doing the faking
    faked_at?: string; // When impersonation was initiated
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
            throw HttpErrors.unauthorized('Authorization token required', 'AUTH_TOKEN_REQUIRED');
        }

        const token = authHeader.substring(7);
        const payload = await verify(token, getJwtSecret()) as JWTPayload;

        // Store JWT payload and context values
        context.set('jwtPayload', payload);
        context.set('tenant', payload.tenant);
        context.set('dbType', payload.db_type || 'postgresql'); // Database backend type (default for legacy tokens)
        context.set('dbName', payload.db); // Extract from compact JWT field
        context.set('nsName', payload.ns); // Extract from compact JWT field

        // Add isSudo() helper to context
        // Checks if user has sudo access via any method:
        // 1. access='root' (automatic sudo)
        // 2. is_sudo=true (explicit sudo token)
        // 3. as_sudo=true (temporary self-service sudo)
        const isSudo = () => {
            const jwtPayload = context.get('jwtPayload') as JWTPayload;
            const asSudo = context.get('as_sudo');
            return jwtPayload?.access === 'root' || jwtPayload?.is_sudo === true || asSudo === true;
        };
        context.set('isSudo', isSudo);

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