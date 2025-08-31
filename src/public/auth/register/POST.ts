import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /auth/register - User registration (not implemented)
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

    // Return not implemented directly
    return context.json({
        success: false,
        error: 'Tenant self-registration is not yet implemented',
        error_code: 'UNIMPLEMENTED'
    }, 403);
}