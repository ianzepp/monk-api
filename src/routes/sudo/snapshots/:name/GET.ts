import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

/**
 * GET /api/sudo/snapshots/:name - Get snapshot details
 *
 * Returns detailed information about a specific snapshot.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const { name } = context.req.param();

    const snapshot = await InfrastructureService.getSnapshot(name);

    return context.json({
        success: true,
        data: snapshot,
    });
}
