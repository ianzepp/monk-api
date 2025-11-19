import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';

/**
 * DELETE /api/sudo/users/:id - Delete user
 *
 * Deletes (soft delete) a user within the authenticated user's tenant.
 * Requires sudo token (obtained via POST /api/user/sudo).
 *
 * Query parameters:
 * - force=true: Perform hard delete instead of soft delete
 */
export default withTransactionParams(async (context, { system }) => {
    const userId = context.req.param('id');

    // Soft delete user (sets trashed_at timestamp)
    await system.database.deleteOne('users', userId);
});
