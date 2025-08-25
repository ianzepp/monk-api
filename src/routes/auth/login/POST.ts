import type { Context } from 'hono';
import { AuthService } from '@lib/auth.js';
import { setRouteResult } from '@lib/middleware/system-context.js';

export default async function (context: Context) {
    const { tenant, username } = await context.req.json();

    // Input validation
    if (!tenant) {
        throw new Error('Tenant is required');
    }

    if (!username) {
        throw new Error('Username is required');
    }

    const result = await AuthService.login(tenant, username);

    if (!result) {
        // Auth-specific error handling
        context.status(401);
        return context.json({
            success: false,
            error: 'Authentication failed',
            error_code: 'AUTH_FAILED'
        });
    }

    setRouteResult(context, result);
}