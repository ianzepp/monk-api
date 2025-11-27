import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';

/**
 * GET /api/sudo/snapshots/:name - Get snapshot details
 *
 * Returns detailed information about a specific snapshot from current tenant.
 * Use this to poll snapshot status after creation.
 * 
 * Requires sudo access.
 */
export default withTransactionParams(async (context, { system }) => {
    const { name } = context.req.param();

    const snapshot = await system.database.select404('snapshots', {
        where: { name }
    }, `Snapshot '${name}' not found`);

    setRouteResult(context, snapshot);
});
