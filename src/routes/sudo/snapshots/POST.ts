import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/sudo/snapshots - Create snapshot from current tenant
 *
 * Creates a point-in-time backup of the current tenant database.
 *
 * Request body:
 * - snapshot_name (optional): Custom snapshot name
 * - description (optional): Snapshot description
 * - snapshot_type (optional): manual (default), auto, pre_migration, scheduled
 * - expires_at (optional): Retention expiration date
 *
 * Requires sudo access.
 */
export default async function (context: Context) {
    const userId = context.get('userId');
    const tenantName = context.get('tenant');
    const body = await context.req.json();

    const snapshot = await InfrastructureService.createSnapshot({
        tenant_name: tenantName,
        snapshot_name: body.snapshot_name,
        description: body.description,
        snapshot_type: body.snapshot_type || 'manual',
        created_by: userId,
        expires_at: body.expires_at ? new Date(body.expires_at) : undefined,
    });

    return context.json({
        success: true,
        data: snapshot,
    });
}
