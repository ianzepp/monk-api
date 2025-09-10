import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * DELETE /api/data/:schema/:record - Delete single record by ID
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, schema, record }) => {
    const isPermanent = context.req.query('permanent') === 'true';

    let result;

    // Permanent delete: set deleted_at = NOW()
    if (isPermanent) {
        // Check root access for permanent deletes
        if (!system.isRoot()) {
            throw HttpErrors.forbidden('Insufficient permissions for permanent delete', 'ACCESS_DENIED');
        }

        result = await system.database.updateOne(schema!, record!, { deleted_at: new Date().toISOString() });
    }

    // Normal soft delete: set trashed_at = NOW()
    else {
        result = await system.database.delete404(schema!, { where: { id: record! } });
    }

    setRouteResult(context, result);
});
