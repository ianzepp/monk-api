import type { Context } from 'hono';

/**
 * GET /api/user/whoami - Get current authenticated user information
 * @see docs/routes/USER_API.md
 */
export default async function (context: Context) {
    return context.json({ success: true, data: context.get('user') });
}
