import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { JWTGenerator } from '@src/lib/jwt-generator.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';

/**
 * POST /api/user/fake - Impersonate another user (root only)
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
 *
 * Error codes:
 * - AUTH_TARGET_USER_MISSING: Neither user_id nor username provided (400)
 * - AUTH_CANNOT_FAKE_SELF: Attempting to fake own user (400)
 * - AUTH_TOKEN_REQUIRED: No valid user JWT provided (401)
 * - AUTH_FAKE_ACCESS_DENIED: User lacks root access (403)
 * - AUTH_TARGET_USER_NOT_FOUND: Target user does not exist (404)
 */
export default async function (context: Context) {
    const currentUser = context.get('user');
    const currentJwt = context.get('jwtPayload');

    if (!currentUser || !currentJwt) {
        throw HttpErrors.unauthorized('Authorization token required', 'AUTH_TOKEN_REQUIRED');
    }

    // Only root users can fake other users
    if (currentUser.access !== 'root') {
        throw HttpErrors.forbidden(
            `User impersonation requires root access (current: '${currentUser.access}')`,
            'AUTH_FAKE_ACCESS_DENIED'
        );
    }

    // Extract target user identifier from request
    const body = await context.req.json().catch(() => ({}));
    const { user_id, username } = body;

    if (!user_id && !username) {
        throw HttpErrors.badRequest(
            'Either user_id or username is required to identify target user',
            'AUTH_TARGET_USER_MISSING'
        );
    }

    const dbName = context.get('dbName');
    const nsName = context.get('nsName');

    if (!dbName || !nsName) {
        throw HttpErrors.unauthorized('Invalid authentication context', 'AUTH_TOKEN_INVALID');
    }

    const db = async (query: string, params: string[]) => {
        const result = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            query,
            params
        );

        return result.rows[0];
    };

    const parseAccess = (value: unknown): string[] => {
        if (Array.isArray(value)) {
            return value as string[];
        }

        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }

        return [];
    };

    // Look up target user in tenant database
    let targetUser;

    if (user_id) {
        const result = await db(
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [user_id]
        );

        targetUser = result;
    } else {
        const result = await db(
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [username]
        );

        targetUser = result;
    }

    if (!targetUser) {
        throw HttpErrors.notFound(
            `Target user not found: ${user_id || username}`,
            'AUTH_TARGET_USER_NOT_FOUND'
        );
    }

    // Prevent faking yourself (use regular login instead)
    if (targetUser.id === currentUser.id) {
        throw HttpErrors.badRequest(
            'Cannot fake your own user - you are already authenticated as this user',
            'AUTH_CANNOT_FAKE_SELF'
        );
    }

    // Generate fake JWT with 1-hour expiration
    const fakeToken = await JWTGenerator.generateFakeToken(
        {
            id: targetUser.id,
            username: targetUser.auth,
            access: targetUser.access,
            access_read: parseAccess(targetUser.access_read),
            access_edit: parseAccess(targetUser.access_edit),
            access_full: parseAccess(targetUser.access_full),
        },
        {
            tenant: currentJwt.tenant,
            dbName: dbName || currentJwt.db,
            nsName: nsName || currentJwt.ns,
            dbType: currentJwt.db_type,
        },
        {
            faked_by_user_id: currentUser.id,
            faked_by_username: currentUser.name,
        }
    );

    // Log impersonation for security audit
    console.warn('User impersonation granted', {
        real_user_id: currentUser.id,
        real_user_name: currentUser.name,
        fake_user_id: targetUser.id,
        fake_user_name: targetUser.name,
        fake_user_auth: targetUser.auth,
        fake_user_access: targetUser.access,
        tenant: currentJwt.tenant,
        expires_in: 900
    });

    return context.json({
        success: true,
        data: {
            fake_token: fakeToken,
            expires_in: 900,
            token_type: 'Bearer',
            target_user: {
                id: targetUser.id,
                name: targetUser.name,
                auth: targetUser.auth,
                access: targetUser.access
            },
            warning: 'Fake token expires in 15 minutes',
            faked_by: {
                id: currentUser.id,
                name: currentUser.name
            }
        }
    });
}
