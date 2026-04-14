import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { register } from '@src/lib/auth.js';

/**
 * POST /auth/register - Tenant registration
 *
 * Creates a brand-new tenant and root user from tenant, username, email, and password.
 * Monk forwards email/password provisioning to Auth0, then mints a Monk bearer token.
 * Clients do not present Auth0 bearer tokens to this route.
 */
export default async function (context: Context) {
    const body = await context.req.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an object', 'BODY_NOT_OBJECT');
    }

    const { tenant, username, email, password } = body;

    const result = await register({ tenant, username, email, password });
    if (!result.success) {
        if (
            result.errorCode === 'AUTH_TENANT_MISSING'
            || result.errorCode === 'AUTH_USERNAME_MISSING'
            || result.errorCode === 'AUTH_EMAIL_MISSING'
            || result.errorCode === 'AUTH_PASSWORD_MISSING'
            || result.errorCode === 'AUTH_TENANT_INVALID'
            || result.errorCode === 'AUTH_USERNAME_INVALID'
            || result.errorCode === 'AUTH_EMAIL_INVALID'
        ) {
            throw HttpErrors.badRequest(result.error, result.errorCode);
        }

        if (result.errorCode === 'DATABASE_TENANT_EXISTS' || result.errorCode === 'AUTH_USERNAME_EXISTS') {
            throw HttpErrors.conflict(result.error, result.errorCode);
        }

        if (result.errorCode.startsWith('AUTH0_')) {
            throw HttpErrors.unauthorized(result.error, result.errorCode);
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
            tenant_id: result.tenantId,
            tenant: result.tenant,
            username: result.username,
            token: result.token,
            expires_in: 24 * 60 * 60,
        },
    });
}
