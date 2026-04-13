import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { JWTGenerator } from '@src/lib/jwt-generator.js';
import type { JWTPayload } from '@src/lib/jwt-generator.js';
import { assertLocalAuthEnabled } from '@src/lib/auth/local-auth-policy.js';

/**
 * POST /api/user/sudo - Elevate user privileges to sudo level
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
    assertLocalAuthEnabled('Local sudo JWT issuance');

    const userJwt = context.get('jwtPayload') as JWTPayload | undefined;
    const user = context.get('user') as
        | {
              id: string;
              username: string;
              tenant: string;
              access: string;
              dbName?: string;
              nsName?: string;
              access_read?: string[];
              access_edit?: string[];
              access_full?: string[];
          }
        | undefined;

    if (!userJwt || !user) {
        throw HttpErrors.unauthorized('Authorization token required', 'AUTH_TOKEN_REQUIRED');
    }

    // Validate user can escalate privileges (root or full users only)
    if (user.access !== 'root' && user.access !== 'full') {
        throw HttpErrors.forbidden(
            `Insufficient privileges for sudo - requires 'root' or 'full' access level (current: '${user.access}')`,
            'AUTH_SUDO_ACCESS_DENIED'
        );
    }

    // Extract optional reason for audit trail
    const { reason } = await context.req.json().catch(() => ({ reason: 'Administrative operation' }));
    const dbName = user.dbName || userJwt.db;
    const nsName = user.nsName || userJwt.ns;

    if (!dbName || !nsName) {
        throw HttpErrors.unauthorized('Invalid authentication context', 'AUTH_TOKEN_INVALID');
    }

    // Generate short-lived sudo token (15 minutes)
    const sudoToken = await JWTGenerator.generateSudoToken(
        {
            id: user.id,
            user_id: user.id,
            username: user.username,
            tenant: user.tenant,
            dbName,
            nsName,
            dbType: userJwt.db_type,
            access: user.access,
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
        },
        { reason }
    );

    // Log sudo escalation for security audit
    console.warn('Sudo elevation granted', {
        user_id: user.id,
        tenant: user.tenant,
        access_level: user.access,
        reason: reason,
        expires_in: 900
    });

    return context.json({
        success: true,
        data: {
            sudo_token: sudoToken,
            expires_in: 900,
            token_type: 'Bearer',
            access_level: user.access,
            is_sudo: true,
            warning: 'Sudo token expires in 15 minutes',
            reason: reason
        }
    });
}
