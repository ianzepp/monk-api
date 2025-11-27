import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * PATCH /api/sudo/users/:id - Update specific user
 *
 * Updates an existing user within the authenticated user's tenant.
 * Requires sudo token (obtained via POST /api/user/sudo).
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
export default withTransaction(async ({ system, body, params }) => {
    const { id } = params;
    await system.database.updateOne('users', id, body);
});
