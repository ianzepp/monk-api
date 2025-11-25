import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/user/whoami - Get current authenticated user information
 * @see docs/routes/USER_API.md
 */
export default async function (context: Context) {
    setRouteResult(context, context.get('user'));
}
