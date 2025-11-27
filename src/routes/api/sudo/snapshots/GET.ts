import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/sudo/snapshots - List all snapshots in current tenant
 *
 * Returns snapshots from the current tenant database.
 * Snapshots are tenant-scoped - each tenant only sees their own snapshots.
 *
 * Requires sudo access.
 */
export default withTransaction(async ({ system }) => {
    // Query snapshots table in current tenant database
    const snapshots = await system.database.selectAny('snapshots', {
        order: [{ field: 'created_at', direction: 'DESC' }]
    });

    return snapshots;
});
