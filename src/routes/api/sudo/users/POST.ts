import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * POST /api/sudo/users - Create new user in current tenant
 *
 * Creates a new user within the authenticated user's tenant.
 * Requires sudo token (obtained via POST /api/user/sudo).
 *
 * This is a tenant-scoped operation - creates users only in the caller's tenant,
 * maintaining proper multi-tenant isolation.
 *
 * Request body:
 * {
 *   "name": "string",           // Display name
 *   "auth": "string",           // Username/email for authentication
 *   "access": "string",         // Access level: deny|read|edit|full|root
 *   "access_read": ["uuid"],    // Optional: Record-level read ACLs
 *   "access_edit": ["uuid"],    // Optional: Record-level edit ACLs
 *   "access_full": ["uuid"]     // Optional: Record-level full ACLs
 * }
 */
export default withTransaction(async ({ system, body }) => {
    // Create user in current tenant's database
    // The 'users' model is marked as system, so this will trigger
    // user/1/root-access-validator which checks for is_sudo flag
    const result = await system.database.createOne('users', body);
    return result;
});
