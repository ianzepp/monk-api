import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

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