import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';

/**
 * POST /api/sudo/sandboxes/:name/extend - Extend sandbox expiration
 *
 * Extends the expiration date of a sandbox.
 * Any admin in the tenant can extend the tenant's sandboxes.
 *
 * Request body:
 * - expires_at (required): New expiration date
 *
 * Requires sudo access.
 */
export default async function (context: Context) {
    const { name } = context.req.param();
    const tenantName = context.get('tenant');
    const body = await context.req.json();

    if (!body.expires_at) {
        throw HttpErrors.badRequest('expires_at is required', 'EXPIRES_AT_MISSING');
    }

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
            'You can only extend sandboxes owned by your tenant',
            'SANDBOX_NOT_OWNED'
        );
    }

    const result = await InfrastructureService.extendSandbox(name, new Date(body.expires_at));

    return context.json({
        success: true,
        data: result,
    });
}
