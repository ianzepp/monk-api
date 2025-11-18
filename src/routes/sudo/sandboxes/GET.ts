import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

/**
 * GET /api/sudo/sandboxes - List all sandboxes
 *
 * Returns sandboxes created by the current user.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const userId = context.get('user_id');

    const sandboxes = await InfrastructureService.listSandboxes({
        created_by: userId,
    });

    return context.json({
        success: true,
        data: sandboxes,
    });
}
