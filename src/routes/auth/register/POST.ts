import type { Context } from 'hono';
import { AuthService } from '@src/lib/auth.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /auth/register - Generate a new tenant for the supplied tenant and username
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

    // TODO
    HttpErrors.forbidden('Tenant self-registration is not yet implemented', 'UNIMPLEMENTED');
}
