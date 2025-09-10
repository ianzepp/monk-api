import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/index.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /auth/refresh - Refresh JWT token using refresh token
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const { token } = await context.req.json();

    // Input validation
    if (!token) {
        throw HttpErrors.badRequest('Token is required for refresh', 'TOKEN_MISSING');
    }

    throw new Error('Unimplemented: /auth/refresh');
}
