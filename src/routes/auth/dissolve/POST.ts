import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { dissolve } from '@src/lib/auth.js';

/**
 * POST /auth/dissolve - Step 1 of tenant/user dissolution
 *
 * Verifies the supplied credentials (same as login) and returns a short-lived
 * confirmation token.  The token is signed with the server secret and carries
 * `is_dissolve: true` so it cannot be used as a normal API bearer token.
 *
 * Request body:
 * ```json
 * { "tenant": "acme", "username": "root_user", "password": "secret" }
 * ```
 *
 * Success response:
 * ```json
 * { "success": true, "data": { "confirmation_token": "...", "expires_in": 300 } }
 * ```
 *
 * Error codes:
 * - AUTH_TENANT_MISSING: Missing tenant field (400)
 * - AUTH_USERNAME_MISSING: Missing username field (400)
 * - AUTH_PASSWORD_MISSING: Missing password field (400)
 * - AUTH_TENANT_INVALID: Non-canonical tenant value (400)
 * - AUTH_USERNAME_INVALID: Non-canonical username value (400)
 * - AUTH_LOGIN_FAILED: Invalid credentials or tenant not found (401)
 */
export default async function (context: Context) {
    const body = await context.req.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an object', 'BODY_NOT_OBJECT');
    }

    const { tenant, username, password } = body;

    console.info('/auth/dissolve', { tenant, username });

    const result = await dissolve({ tenant, username, password });

    if (!result.success) {
        if (
            result.errorCode === 'AUTH_TENANT_MISSING'
            || result.errorCode === 'AUTH_USERNAME_MISSING'
            || result.errorCode === 'AUTH_PASSWORD_MISSING'
            || result.errorCode === 'AUTH_TENANT_INVALID'
            || result.errorCode === 'AUTH_USERNAME_INVALID'
        ) {
            throw HttpErrors.badRequest(result.error, result.errorCode);
        }

        return context.json(
            {
                success: false,
                error: result.error,
                error_code: result.errorCode,
            },
            401
        );
    }

    return context.json({
        success: true,
        data: {
            confirmation_token: result.confirmation_token,
            expires_in: result.expires_in,
        },
    });
}
