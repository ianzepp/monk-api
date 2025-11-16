import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { setRouteResult } from '@src/lib/middleware/index.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { JWTPayload } from '@src/lib/middleware/jwt-validation.js';

/**
 * POST /api/auth/fake - Impersonate another user (root only)
 *
 * Allows root users to generate a JWT as another user for debugging and support.
 * The fake JWT includes metadata about the impersonation for audit trail.
 *
 * Security:
 * - Only users with access='root' can use this endpoint
 * - Shorter-lived token (1 hour vs 24 hours)
 * - Full audit logging of who faked whom
 * - Fake metadata included in JWT payload
 *
 * Use cases:
 * - Debugging user-specific issues
 * - Customer support troubleshooting
 * - Testing user permissions
 */
export default async function (context: Context) {
    const currentUser = context.get('user');
    const currentJwt = context.get('jwtPayload');

    if (!currentUser || !currentJwt) {
        throw HttpErrors.unauthorized('Valid user JWT required', 'USER_JWT_REQUIRED');
    }

    // Only root users can fake other users
    if (currentUser.access !== 'root') {
        throw HttpErrors.forbidden(
            `User impersonation requires root access (current: '${currentUser.access}')`,
            'FAKE_ACCESS_DENIED'
        );
    }

    // Extract target user identifier from request
    const body = await context.req.json().catch(() => ({}));
    const { user_id, username } = body;

    if (!user_id && !username) {
        throw HttpErrors.badRequest(
            'Either user_id or username is required to identify target user',
            'TARGET_USER_MISSING'
        );
    }

    // Look up target user in tenant database
    const db = context.get('db');
    let targetUser;

    if (user_id) {
        const result = await db.query(
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [user_id]
        );
        targetUser = result.rows[0];
    } else {
        const result = await db.query(
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [username]
        );
        targetUser = result.rows[0];
    }

    if (!targetUser) {
        throw HttpErrors.notFound(
            `Target user not found: ${user_id || username}`,
            'TARGET_USER_NOT_FOUND'
        );
    }

    // Prevent faking yourself (use regular login instead)
    if (targetUser.id === currentUser.id) {
        throw HttpErrors.badRequest(
            'Cannot fake your own user - you are already authenticated as this user',
            'CANNOT_FAKE_SELF'
        );
    }

    // Generate fake JWT with 1-hour expiration
    const payload: JWTPayload = {
        sub: targetUser.id,
        user_id: targetUser.id,
        tenant: currentJwt.tenant,
        database: currentJwt.database,
        access: targetUser.access,
        access_read: targetUser.access_read || [],
        access_edit: targetUser.access_edit || [],
        access_full: targetUser.access_full || [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        // Target user gets is_sudo if they're root
        is_sudo: targetUser.access === 'root',
        // Fake/impersonation metadata for audit trail
        is_fake: true,
        faked_by_user_id: currentUser.id,
        faked_by_username: currentUser.name,
        faked_at: new Date().toISOString(),
    };

    const fakeToken = await sign(payload, process.env['JWT_SECRET']!);

    // Log impersonation for security audit
    logger.warn('User impersonation granted', {
        real_user_id: currentUser.id,
        real_user_name: currentUser.name,
        fake_user_id: targetUser.id,
        fake_user_name: targetUser.name,
        fake_user_auth: targetUser.auth,
        fake_user_access: targetUser.access,
        tenant: currentJwt.tenant,
        expires_in: 3600
    });

    setRouteResult(context, {
        fake_token: fakeToken,
        expires_in: 3600,
        token_type: 'Bearer',
        target_user: {
            id: targetUser.id,
            name: targetUser.name,
            auth: targetUser.auth,
            access: targetUser.access
        },
        warning: 'Fake token expires in 1 hour',
        faked_by: {
            id: currentUser.id,
            name: currentUser.name
        }
    });
}
