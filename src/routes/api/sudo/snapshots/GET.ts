import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';

/**
 * GET /api/sudo/snapshots - List all snapshots in current tenant
 *
 * Returns snapshots from the current tenant database.
 * Snapshots are tenant-scoped - each tenant only sees their own snapshots.
 * 
 * Requires sudo access.
 */
export default withTransactionParams(async (context, { system }) => {
    // Query snapshots table in current tenant database
    const snapshots = await system.database.selectAny('snapshots', {
        order: [{ field: 'created_at', direction: 'DESC' }]
    });

    setRouteResult(context, snapshots);
});
