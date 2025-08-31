/**
 * Root Access Validation Middleware
 * 
 * Validates that JWT token has root-level access for /api/root/* operations.
 * Requires either elevated (sudo) token or base root user.
 */

import type { Context, Next } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { JWTPayload } from './jwt-validation.js';

/**
 * Root access validation middleware
 * 
 * Ensures JWT token has root access level for administrative operations.
 * Applied to /api/root/* routes that require elevated privileges.
 */
export async function rootAccessMiddleware(context: Context, next: Next) {
    const jwtPayload = context.get('jwtPayload') as JWTPayload;
    const user = context.get('user');
    
    if (!jwtPayload || !user) {
        throw HttpErrors.unauthorized('Valid JWT required for root operations', 'JWT_REQUIRED');
    }
    
    // Validate root access level
    if (jwtPayload.access !== 'root') {
        throw HttpErrors.forbidden(
            'Root privileges required - use POST /api/auth/sudo to elevate access', 
            'ROOT_ACCESS_REQUIRED'
        );
    }
    
    // Log root operation for security audit
    logger.warn('Root operation accessed', {
        user_id: user.id,
        tenant: user.tenant,
        path: context.req.path,
        method: context.req.method,
        elevated_from: jwtPayload.elevated_from,
        elevation_reason: jwtPayload.elevation_reason,
        token_expires: new Date(jwtPayload.exp * 1000).toISOString()
    });
    
    // Set root access flag for route handlers
    context.set('isRoot', true);
    context.set('elevatedFrom', jwtPayload.elevated_from);
    
    await next();
}