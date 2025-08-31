import type { Context } from 'hono';
import { AuthService } from '@src/lib/auth.js';
import { setRouteResult } from '@src/lib/middleware/index.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { Filter } from '@src/lib/filter.js';

/**
 * POST /auth/login - Authenticate user with tenant and username
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

    const result = await AuthService.login(tenant, username);

    if (!result) {
        // Auth-specific error handling
        context.status(401);
        return context.json({
            success: false,
            error: 'Authentication failed',
            error_code: 'AUTH_FAILED',
        });
    }

    setRouteResult(context, result);
}
