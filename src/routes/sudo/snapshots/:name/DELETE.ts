import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

/**
 * DELETE /api/sudo/snapshots/:name - Delete snapshot
 *
 * Deletes a snapshot record and drops its database.
 * Users can only delete snapshots they created (ownership check via ACLs).
 * 
 * Requires sudo access.
 */
export default withTransactionParams(async (context, { system }) => {
    const { name } = context.req.param();
    const userId = context.get('userId');

    // Get snapshot (throws 404 if not found)
    const snapshot = await system.database.select404('snapshots', {
        where: { name }
    }, `Snapshot '${name}' not found`);

    // Verify ownership
    if (snapshot.created_by !== userId) {
        throw HttpErrors.forbidden(
            'You can only delete snapshots you created',
            'SNAPSHOT_NOT_OWNED'
        );
    }

    // Drop the snapshot database
    await InfrastructureService.deleteSnapshotDatabase(snapshot.database);

    // Delete the snapshot record
    await system.database.deleteOne('snapshots', snapshot.id);

    setRouteResult(context, {
        success: true,
        deleted: name,
        database: snapshot.database
    });
});
