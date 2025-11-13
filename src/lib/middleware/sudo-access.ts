/**
 * Sudo Access Validation Middleware
 * 
 * Validates that JWT token is a valid sudo token for /api/sudo/* operations.
 * Requires short-lived sudo token obtained via POST /api/auth/sudo.
 * 
 * This ensures dangerous operations (like user management) require explicit
 * privilege escalation even for root users, providing audit trail and
 * time-limited access to sensitive operations.
 */

import type { Context, Next } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';
import type { JWTPayload } from './jwt-validation.js';

/**
 * Sudo access validation middleware
 * 
 * Ensures JWT token is a valid sudo token (root access + is_sudo flag).
 * Applied to /api/sudo/* routes that require explicit privilege elevation.
 */
export async function sudoAccessMiddleware(context: Context, next: Next) {
    const jwtPayload = context.get('jwtPayload') as JWTPayload;
    const user = context.get('user');
    
    if (!jwtPayload || !user) {
        throw HttpErrors.unauthorized('Valid JWT required for sudo operations', 'JWT_REQUIRED');
    }
    
    // Validate sudo token (must have root access AND is_sudo flag)
    if (jwtPayload.access !== 'root' || !jwtPayload.is_sudo) {
        throw HttpErrors.forbidden(
            'Sudo token required - use POST /api/auth/sudo to get short-lived sudo access', 
            'SUDO_TOKEN_REQUIRED'
        );
    }
    
    // Log sudo operation for security audit
    logger.warn('Sudo operation accessed', {
        user_id: user.id,
        tenant: user.tenant,
        path: context.req.path,
        method: context.req.method,
        elevated_from: jwtPayload.elevated_from,
        elevation_reason: jwtPayload.elevation_reason,
        token_expires: new Date(jwtPayload.exp * 1000).toISOString()
    });
    
    // Set sudo access flag for route handlers
    context.set('isSudo', true);
    context.set('elevatedFrom', jwtPayload.elevated_from);
    
    await next();
}
