import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

/**
 * GET /api/sudo/sandboxes/:name - Get sandbox details
 *
 * Returns detailed information about a specific sandbox.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const { name } = context.req.param();

    const sandbox = await InfrastructureService.getSandbox(name);

    return context.json({
        success: true,
        data: sandbox,
    });
}
