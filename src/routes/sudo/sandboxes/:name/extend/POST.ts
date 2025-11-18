import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/sudo/sandboxes/:name/extend - Extend sandbox expiration
 *
 * Extends the expiration date of a sandbox.
 * Users can only extend their own sandboxes.
 *
 * Request body:
 * - expires_at (required): New expiration date
 *
 * Requires sudo access.
 */
export default async function (context: Context) {
    const { name } = context.req.param();
    const userId = context.get('user_id');
    const body = await context.req.json();

    if (!body.expires_at) {
        throw HttpErrors.badRequest('expires_at is required', 'EXPIRES_AT_MISSING');
    }

    // Verify ownership
    const sandbox = await InfrastructureService.getSandbox(name);
    if (sandbox.created_by !== userId) {
        throw HttpErrors.forbidden(
            'You can only extend sandboxes you created',
            'SANDBOX_NOT_OWNED'
        );
    }

    const result = await InfrastructureService.extendSandbox(name, new Date(body.expires_at));

    return context.json({
        success: true,
        data: result,
    });
}
