import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * DELETE /api/sudo/sandboxes/:name - Delete sandbox
 *
 * Deletes a sandbox database and its registry entry.
 * Users can only delete their own sandboxes.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const { name } = context.req.param();
    const userId = context.get('user_id');

    // Verify ownership
    const sandbox = await InfrastructureService.getSandbox(name);
    if (sandbox.created_by !== userId) {
        throw HttpErrors.forbidden(
            'You can only delete sandboxes you created',
            'SANDBOX_NOT_OWNED'
        );
    }

    const result = await InfrastructureService.deleteSandbox(name);

    return context.json({
        success: true,
        data: result,
    });
}
