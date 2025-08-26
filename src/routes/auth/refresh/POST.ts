import type { Context } from 'hono';
import { AuthService } from '@src/lib/auth.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default async function (context: Context) {
    const { token } = await context.req.json();

    // Input validation
    if (!token) {
        throw new Error('Token is required for refresh');
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