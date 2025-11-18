import type { Context} from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * DELETE /api/sudo/snapshots/:name - Delete snapshot
 *
 * Deletes a snapshot database and its registry entry.
 * Users can only delete their own snapshots.
 * Requires sudo access.
 */
export default async function (context: Context) {
    const { name } = context.req.param();
    const userId = context.get('user_id');

    // Verify ownership
    const snapshot = await InfrastructureService.getSnapshot(name);
    if (snapshot.created_by !== userId) {
        throw HttpErrors.forbidden(
            'You can only delete snapshots you created',
            'SNAPSHOT_NOT_OWNED'
        );
    }

    const result = await InfrastructureService.deleteSnapshot(name);

    return context.json({
        success: true,
        data: result,
    });
}
