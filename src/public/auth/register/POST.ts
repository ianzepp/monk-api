import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseTemplate } from '@src/lib/database-template.js';
import type { JWTPayload } from '@src/lib/middleware/jwt-validation.js';

/**
 * POST /auth/register - User registration
 *
 * Creates a new tenant from the 'empty' template with a user-specified tenant name.
 * Returns a JWT token for immediate access to the new tenant.
 *
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const { tenant, username } = await context.req.json();

    // Input validation
    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'TENANT_MISSING');
    }

    if (!username) {
        throw HttpErrors.badRequest('Username is required', 'USERNAME_MISSING');
    }

    // Clone empty template with user-provided tenant name
    const cloneResult = await DatabaseTemplate.cloneTemplate({
        template_name: 'empty',
        tenant_name: tenant,
        username: username,
        user_access: 'full',
    });

    // Generate JWT token for the new user
    const payload: JWTPayload = {
        sub: cloneResult.user.id,
        user_id: cloneResult.user.id,
        tenant: cloneResult.tenant,
        database: cloneResult.database,
        access: cloneResult.user.access,
        access_read: cloneResult.user.access_read,
        access_edit: cloneResult.user.access_edit,
        access_full: cloneResult.user.access_full,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };

    const token = await sign(payload, process.env.JWT_SECRET!);

    return context.json({
        success: true,
        data: {
            tenant: cloneResult.tenant,
            database: cloneResult.database,
            username: cloneResult.user.auth,
            token: token,
            expires_in: 24 * 60 * 60,
        },
    });
}
