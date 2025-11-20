import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';

/**
 * DELETE /api/sudo/sandboxes/:name - Delete sandbox
 *
 * Deletes a sandbox database and its registry entry.
 * Any admin in the tenant can delete the tenant's sandboxes.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const { name } = context.req.param();
    const tenantName = context.get('tenant');

    // Get current tenant ID
    const mainPool = DatabaseConnection.getMainPool();
    const tenantResult = await mainPool.query(
        'SELECT id FROM tenants WHERE name = $1',
        [tenantName]
    );

    if (tenantResult.rows.length === 0) {
        throw HttpErrors.forbidden('Tenant not found', 'TENANT_NOT_FOUND');
    }

    const tenantId = tenantResult.rows[0].id;

    // Verify sandbox belongs to this tenant
    const sandbox = await InfrastructureService.getSandbox(name);
    if (sandbox.parent_tenant_id !== tenantId) {
        throw HttpErrors.forbidden(
            'You can only delete sandboxes owned by your tenant',
            'SANDBOX_NOT_OWNED'
        );
    }

    const result = await InfrastructureService.deleteSandbox(name);

    return context.json({
        success: true,
        data: result,
    });
}
