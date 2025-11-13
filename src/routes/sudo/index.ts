import { Hono } from 'hono';

/**
 * Sudo API Routes - Privileged Operations
 * 
 * These routes require explicit sudo token obtained via POST /api/auth/sudo.
 * Even users with access='root' must explicitly escalate to get short-lived
 * sudo tokens before accessing these endpoints.
 * 
 * This provides:
 * - Audit trail for dangerous operations
 * - Time-limited access (15 minute sudo tokens)
 * - Explicit intent requirement
 * - Tenant-scoped operations (no cross-tenant access)
 *
 * Routes:
 * - POST /api/sudo/users - Create user in current tenant
 * - PATCH /api/sudo/users/:id - Update user in current tenant
 * - DELETE /api/sudo/users/:id - Delete user in current tenant
 */

const sudoRouter = new Hono();

// User Management Routes (tenant-scoped)
import usersPOST from '@src/routes/sudo/users/POST.js';
import usersPATCH from '@src/routes/sudo/users/:id/PATCH.js';
import usersDELETE from '@src/routes/sudo/users/:id/DELETE.js';

sudoRouter.post('/users', usersPOST);
sudoRouter.patch('/users/:id', usersPATCH);
sudoRouter.delete('/users/:id', usersDELETE);

export { sudoRouter };
