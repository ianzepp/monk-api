import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

/**
 * GET /api/sudo/templates/:name - Get template details
 *
 * Returns detailed information about a specific template.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const { name } = context.req.param();

    const template = await InfrastructureService.getTemplate(name);

    return context.json({
        success: true,
        data: template,
    });
}
