import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';

/**
 * PATCH /api/sudo/users/:id - Update specific user
 *
 * Updates an existing user within the authenticated user's tenant.
 * Requires sudo token (obtained via POST /api/auth/sudo).
 *
 * Request body contains fields to update:
 * {
 *   "name": "string",           // Optional: Update display name
 *   "access": "string",         // Optional: Update access level
 *   "access_read": ["uuid"],    // Optional: Update read ACLs
 *   "access_edit": ["uuid"],    // Optional: Update edit ACLs
 *   "access_full": ["uuid"]     // Optional: Update full ACLs
 * }
 */
export default withTransactionParams(async (context, { system, body }) => {
    const userId = context.req.param('id');
    const result = await system.database.updateOne('users', userId, body);
    return result;
});
