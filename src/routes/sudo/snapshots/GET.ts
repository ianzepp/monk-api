import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

/**
 * GET /api/sudo/snapshots - List all snapshots
 *
 * Returns snapshots created by the current user.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const userId = context.get('user_id');

    const snapshots = await InfrastructureService.listSnapshots({
        created_by: userId,
    });

    return context.json({
        success: true,
        data: snapshots,
    });
}
