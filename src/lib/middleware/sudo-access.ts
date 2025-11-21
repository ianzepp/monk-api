/**
 * Sudo Access Validation Middleware
 *
 * Validates that JWT token is a valid sudo token for /api/sudo/* operations.
 * Requires short-lived sudo token obtained via POST /api/user/sudo.
 *
 * This ensures dangerous operations (like user management) require explicit
 * privilege escalation even for root users, providing audit trail and
 * time-limited access to sensitive operations.
 */

import type { Context, Next } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { JWTPayload } from './jwt-validation.js';

/**
 * Sudo access validation middleware
 *
 * Validates user has sudo access via one of:
 * - access='root' (automatic sudo, like Linux root user)
 * - is_sudo=true (explicit sudo token from POST /api/user/sudo)
 * - as_sudo=true (temporary self-service sudo flag)
 *
 * Applied to /api/sudo/* routes that require privileged access.
 */
export async function sudoAccessMiddleware(context: Context, next: Next) {
    const jwtPayload = context.get('jwtPayload') as JWTPayload;
    const user = context.get('user');
    const isSudo = context.get('isSudo') as (() => boolean);

    if (!jwtPayload || !user) {
        throw HttpErrors.unauthorized('Valid JWT required for sudo operations', 'JWT_REQUIRED');
    }

    // Check sudo access via helper (checks root, is_sudo, or as_sudo)
    if (!isSudo || !isSudo()) {
        throw HttpErrors.forbidden(
            'Sudo access required - root users have automatic access, others must use POST /api/user/sudo',
            'SUDO_ACCESS_REQUIRED'
        );
    }

    // Log sudo operation for security audit
    const logLevel = jwtPayload.access === 'root' && !jwtPayload.is_sudo ? 'info' : 'warn';
    console[logLevel]('Sudo operation accessed', {
        user_id: user.id,
        tenant: user.tenant,
        path: context.req.path,
        method: context.req.method,
        access_method: jwtPayload.access === 'root' ? 'root_automatic' :
                       jwtPayload.is_sudo ? 'explicit_sudo' : 'as_sudo_flag',
        elevated_from: jwtPayload.elevated_from,
        elevation_reason: jwtPayload.elevation_reason,
        token_expires: new Date(jwtPayload.exp * 1000).toISOString()
    });

    // Set metadata for route handlers
    context.set('elevatedFrom', jwtPayload.elevated_from);

    return await next();
}
