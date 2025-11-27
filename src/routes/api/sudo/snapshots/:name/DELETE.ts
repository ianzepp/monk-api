import { withTransaction } from '@src/lib/api-helpers.js';
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
export default withTransaction(async ({ system, params }) => {
    const { name } = params;
    const userId = system.userId;

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

    return {
        success: true,
        deleted: name,
        database: snapshot.database
    };
});
