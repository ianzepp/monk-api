import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/sudo/sandboxes - Create sandbox from template
 *
 * Creates a new sandbox database cloned from a template.
 * The sandbox is isolated and can be used for testing.
 *
 * Request body:
 * - template_name (required): Template to clone from
 * - sandbox_name (optional): Custom sandbox name
 * - description (optional): Sandbox description
 * - purpose (optional): Why this sandbox exists
 * - expires_at (optional): Auto-expiration date
 *
 * Requires sudo access.
 */
export default async function (context: Context) {
    const userId = context.get('user_id');
    const body = await context.req.json();

    if (!body.template_name) {
        throw HttpErrors.badRequest('template_name is required', 'TEMPLATE_NAME_MISSING');
    }

    const sandbox = await InfrastructureService.createSandbox({
        template_name: body.template_name,
        sandbox_name: body.sandbox_name,
        description: body.description,
        purpose: body.purpose,
        created_by: userId,
        expires_at: body.expires_at ? new Date(body.expires_at) : undefined,
    });

    return context.json({
        success: true,
        data: sandbox,
    });
}
