import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { setRouteResult } from '@src/lib/middleware/index.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { JWTPayload } from '@src/lib/middleware/jwt-validation.js';

/**
 * POST /api/auth/sudo - Elevate user privileges to root level
 *
 * Generates short-lived root token for sudo operations.
 * Requires existing user JWT and sufficient base privileges.
 */
export default async function (context: Context) {
    const userJwt = context.get('jwtPayload');
    const user = context.get('user');

    if (!userJwt || !user) {
        throw HttpErrors.unauthorized('Valid user JWT required for privilege escalation', 'USER_JWT_REQUIRED');
    }

    // Validate user can escalate privileges (only root users)
    if (user.access !== 'root') {
        throw HttpErrors.forbidden('Insufficient privileges for sudo - root access required', 'SUDO_ACCESS_DENIED');
    }

    // Extract optional reason for audit trail
    const { reason } = await context.req.json().catch(() => ({ reason: 'Administrative operation' }));

    // Generate short-lived root token (15 minutes)
    const rootUser = {
        id: user.id,
        user_id: user.id,
        tenant: user.tenant,
        database: user.database,
        username: user.name,
        access: 'root',
        access_read: user.access_read || [],
        access_edit: user.access_edit || [],
        access_full: user.access_full || [],
        access_deny: user.access_deny || [],
        is_active: true,
        // Elevation metadata
        elevated_from: user.access,
        elevated_at: new Date().toISOString(),
        elevation_reason: reason
    };

    // Generate short-lived sudo token
    const payload: JWTPayload = {
        sub: rootUser.id,
        user_id: rootUser.user_id,
        tenant: rootUser.tenant,
        database: rootUser.database,
        access: 'root',
        access_read: rootUser.access_read || [],
        access_edit: rootUser.access_edit || [],
        access_full: rootUser.access_full || [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
        // Sudo elevation metadata
        is_sudo: true,
        elevated_from: rootUser.elevated_from,
        elevated_at: rootUser.elevated_at,
        elevation_reason: rootUser.elevation_reason
    };

    const rootToken = await sign(payload, process.env['JWT_SECRET']!);

    // Log privilege escalation for security audit
    logger.warn('Privilege escalation granted', {
        user_id: user.id,
        tenant: user.tenant,
        from_access: user.access,
        to_access: 'root',
        reason: reason,
        expires_in: 900
    });

    setRouteResult(context, {
        root_token: rootToken,
        expires_in: 900,
        token_type: 'Bearer',
        access_level: 'root',
        warning: 'Root token expires in 15 minutes',
        elevated_from: user.access,
        reason: reason
    });
}
