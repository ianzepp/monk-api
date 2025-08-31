import type { Context } from 'hono';
import { AuthService } from '@src/lib/auth.js';
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

    const newToken = await AuthService.refreshToken(token);

    if (!newToken) {
        // Auth-specific error handling
        context.status(401);
        return context.json({
            success: false,
            error: 'Token refresh failed',
            error_code: 'TOKEN_REFRESH_FAILED'
        });
    }

    setRouteResult(context, { token: newToken });
}