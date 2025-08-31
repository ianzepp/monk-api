import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseTemplate } from '@src/lib/database-template.js';
import type { JWTPayload } from '@src/lib/middleware/jwt-validation.js';

/**
 * POST /auth/register-demo - Creates a demo environment from a pre-existing named template
 *
 * @param template_name The name of the pre-existing template
 * @param username The username for a new user in the new demo environment
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const { template_name, username } = await context.req.json();

    // Input validation
    if (!template_name) {
        throw HttpErrors.badRequest('Missing required value for "template_name"', 'TEMPLATE_NAME_MISSING');
    }

    if (!username) {
        throw HttpErrors.badRequest('Missing required value for "username"', 'USERNAME_MISSING');
    }

    // Clone template and create demo tenant
    const cloneResult = await DatabaseTemplate.cloneTemplate({
        template_name: template_name,
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
            template_used: cloneResult.template_used,
            demo_note: 'This is a temporary demo environment with sample data',
        },
    });
}
