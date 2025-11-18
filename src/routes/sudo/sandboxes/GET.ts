import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';

/**
 * GET /api/sudo/sandboxes - List all sandboxes for current tenant
 *
 * Returns all sandboxes owned by the current tenant.
 * All admins in the tenant can see and manage these sandboxes.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const tenantName = context.get('tenant');

    // Get tenant ID from tenant name
    const mainPool = DatabaseConnection.getMainPool();
    const tenantResult = await mainPool.query(
        'SELECT id FROM tenants WHERE name = $1',
        [tenantName]
    );

    if (tenantResult.rows.length === 0) {
        return context.json({ success: true, data: [] });
    }

    const tenantId = tenantResult.rows[0].id;

    const sandboxes = await InfrastructureService.listSandboxes({
        tenant_id: tenantId,
    });

    return context.json({
        success: true,
        data: sandboxes,
    });
}
