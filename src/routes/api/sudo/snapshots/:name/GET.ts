import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/sudo/snapshots/:name - Get snapshot details
 *
 * Returns detailed information about a specific snapshot from current tenant.
 * Use this to poll snapshot status after creation.
 *
 * Requires sudo access.
 */
export default withTransaction(async ({ system, params }) => {
    const { name } = params;

    const snapshot = await system.database.select404('snapshots', {
        where: { name }
    }, `Snapshot '${name}' not found`);

    return snapshot;
});
