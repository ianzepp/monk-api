import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { setRouteResult } from '@src/lib/middleware/index.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { JWTPayload } from '@src/lib/middleware/jwt-validation.js';

/**
 * POST /api/auth/sudo - Elevate user privileges to sudo level
 *
 * Generates short-lived sudo token for protected operations.
 * Requires existing user JWT and sufficient base privileges (root or full).
 *
 * Access levels:
 * - root: Automatically has is_sudo=true at login, can request sudo token for audit trail
 * - full: Can request sudo token to elevate privileges temporarily
 * - edit/read/deny: Cannot request sudo tokens
 */
export default async function (context: Context) {
    const userJwt = context.get('jwtPayload');
    const user = context.get('user');

    if (!userJwt || !user) {
        throw HttpErrors.unauthorized('Valid user JWT required for privilege escalation', 'USER_JWT_REQUIRED');
    }

    // Validate user can escalate privileges (root or full users only)
    if (user.access !== 'root' && user.access !== 'full') {
        throw HttpErrors.forbidden(
            `Insufficient privileges for sudo - requires 'root' or 'full' access level (current: '${user.access}')`,
            'SUDO_ACCESS_DENIED'
        );
    }

    // Extract optional reason for audit trail
    const { reason } = await context.req.json().catch(() => ({ reason: 'Administrative operation' }));

    // Generate short-lived sudo token (15 minutes)
    // Keep original access level, just set is_sudo=true
    const payload: JWTPayload = {
        sub: user.id,
        user_id: user.id,
        tenant: user.tenant,
        database: user.database,
        access: user.access, // Keep original access level (root or full)
        access_read: user.access_read || [],
        access_edit: user.access_edit || [],
        access_full: user.access_full || [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
        // Sudo elevation metadata
        is_sudo: true,
        elevated_from: user.access,
        elevated_at: new Date().toISOString(),
        elevation_reason: reason
    };

    const sudoToken = await sign(payload, process.env['JWT_SECRET']!);

    // Log sudo escalation for security audit
    logger.warn('Sudo elevation granted', {
        user_id: user.id,
        tenant: user.tenant,
        access_level: user.access,
        reason: reason,
        expires_in: 900
    });

    setRouteResult(context, {
        sudo_token: sudoToken,
        expires_in: 900,
        token_type: 'Bearer',
        access_level: user.access,
        is_sudo: true,
        warning: 'Sudo token expires in 15 minutes',
        reason: reason
    });
}
