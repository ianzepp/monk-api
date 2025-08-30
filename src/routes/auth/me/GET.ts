import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /auth/me - Get current authenticated user information
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const user = context.get('user');
    
    setRouteResult(context, {
        id: user.id,
        username: user.username,
        email: user.email,
        tenant: user.tenant,
        database: user.database,
        role: user.role,
        is_active: user.is_active,
        last_login: user.last_login
    });
}