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
 *
 * Routes:
 * User Management (tenant-scoped):
 * - POST /api/sudo/users - Create user in current tenant
 * - PATCH /api/sudo/users/:id - Update user in current tenant
 * - DELETE /api/sudo/users/:id - Delete user in current tenant
 *
 * Infrastructure (read-only):
 * - GET /api/sudo/templates - List available templates
 * - GET /api/sudo/templates/:name - Get template details
 *
 * Sandbox Management (tenant-scoped):
 * - GET /api/sudo/sandboxes - List user's sandboxes
 * - POST /api/sudo/sandboxes - Create sandbox from template
 * - GET /api/sudo/sandboxes/:name - Get sandbox details
 * - DELETE /api/sudo/sandboxes/:name - Delete sandbox
 * - POST /api/sudo/sandboxes/:name/extend - Extend sandbox expiration
 *
 * Snapshot Management (tenant-scoped):
 * - GET /api/sudo/snapshots - List user's snapshots
 * - POST /api/sudo/snapshots - Create snapshot of current tenant
 * - GET /api/sudo/snapshots/:name - Get snapshot details
 * - DELETE /api/sudo/snapshots/:name - Delete snapshot
 */

const sudoRouter = new Hono();

// User Management Routes (tenant-scoped)
import usersPOST from '@src/routes/sudo/users/POST.js';
import usersPATCH from '@src/routes/sudo/users/:id/PATCH.js';
import usersDELETE from '@src/routes/sudo/users/:id/DELETE.js';

sudoRouter.post('/users', usersPOST);
sudoRouter.patch('/users/:id', usersPATCH);
sudoRouter.delete('/users/:id', usersDELETE);

// Template Management Routes (read-only)
import templatesGET from '@src/routes/sudo/templates/GET.js';
import templateGET from '@src/routes/sudo/templates/:name/GET.js';

sudoRouter.get('/templates', templatesGET);
sudoRouter.get('/templates/:name', templateGET);

// Sandbox Management Routes (tenant-scoped)
import sandboxesGET from '@src/routes/sudo/sandboxes/GET.js';
import sandboxesPOST from '@src/routes/sudo/sandboxes/POST.js';
import sandboxGET from '@src/routes/sudo/sandboxes/:name/GET.js';
import sandboxDELETE from '@src/routes/sudo/sandboxes/:name/DELETE.js';
import sandboxExtendPOST from '@src/routes/sudo/sandboxes/:name/extend/POST.js';

sudoRouter.get('/sandboxes', sandboxesGET);
sudoRouter.post('/sandboxes', sandboxesPOST);
sudoRouter.get('/sandboxes/:name', sandboxGET);
sudoRouter.delete('/sandboxes/:name', sandboxDELETE);
sudoRouter.post('/sandboxes/:name/extend', sandboxExtendPOST);

// Snapshot Management Routes (tenant-scoped)
import snapshotsGET from '@src/routes/sudo/snapshots/GET.js';
import snapshotsPOST from '@src/routes/sudo/snapshots/POST.js';
import snapshotGET from '@src/routes/sudo/snapshots/:name/GET.js';
import snapshotDELETE from '@src/routes/sudo/snapshots/:name/DELETE.js';

sudoRouter.get('/snapshots', snapshotsGET);
sudoRouter.post('/snapshots', snapshotsPOST);
sudoRouter.get('/snapshots/:name', snapshotGET);
sudoRouter.delete('/snapshots/:name', snapshotDELETE);

export { sudoRouter };
