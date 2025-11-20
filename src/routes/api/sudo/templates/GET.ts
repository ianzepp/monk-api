import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

/**
 * GET /api/sudo/templates - List all templates
 *
 * Returns all template databases available for cloning.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const templates = await InfrastructureService.listTemplates();

    return context.json({
        success: true,
        data: templates,
    });
}
