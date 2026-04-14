import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { dissolveConfirm } from '@src/lib/auth.js';

/**
 * POST /auth/dissolve/confirm - Step 2 of tenant/user dissolution
 *
 * Accepts a short-lived confirmation token from `POST /auth/dissolve` in the
 * request body, validates it, and permanently soft-deletes the tenant and its
 * root user.  After this call, `POST /auth/login` for the same credentials
 * will no longer succeed.
 *
 * The confirmation token must be supplied in the POST body under the key
 * `confirmation_token`.  It must NOT be sent in the `Authorization` header or
 * in the URL.
 *
 * Request body:
 * ```json
 * { "confirmation_token": "..." }
 * ```
 *
 * Success response:
 * ```json
 * { "success": true, "data": { "tenant": "acme", "username": "root_user", "dissolved": true } }
 * ```
 *
 * Error codes:
 * - DISSOLVE_TOKEN_MISSING: `confirmation_token` field absent (400)
 * - DISSOLVE_TOKEN_EXPIRED: Token has expired (401)
 * - DISSOLVE_TOKEN_INVALID: Token is malformed, not a dissolve token, or claims mismatch (401)
 * - DISSOLVE_TENANT_NOT_FOUND: Tenant is not found or already dissolved (404)
 */
export default async function (context: Context) {
    const body = await context.req.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an object', 'BODY_NOT_OBJECT');
    }

    const { confirmation_token } = body;

    console.info('/auth/dissolve/confirm');

    const result = await dissolveConfirm({ confirmation_token });

    if (!result.success) {
        if (result.errorCode === 'DISSOLVE_TOKEN_MISSING') {
            throw HttpErrors.badRequest(result.error, result.errorCode);
        }

        if (result.errorCode === 'DISSOLVE_TENANT_NOT_FOUND') {
            return context.json(
                {
                    success: false,
                    error: result.error,
                    error_code: result.errorCode,
                },
                404
            );
        }

        // DISSOLVE_TOKEN_EXPIRED, DISSOLVE_TOKEN_INVALID
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
            tenant: result.tenant,
            username: result.username,
            dissolved: result.dissolved,
        },
    });
}
