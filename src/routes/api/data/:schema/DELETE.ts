import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * DELETE /api/data/:schema - Bulk delete records in schema
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, schema, body }) => {
    const isPermanent = context.req.query('permanent') === 'true';

    // Always expect array input for DELETE /api/data/:schema
    if (!Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an array of records with id fields', 'REQUEST_INVALID_FORMAT');
    }

    let result;

    // Permanent delete: set deleted_at = NOW() for all records
    if (isPermanent) {
        // Check root access for permanent deletes
        if (!system.isRoot()) {
            throw HttpErrors.forbidden('Insufficient permissions for permanent delete', 'ACCESS_DENIED');
        }

        const permanentUpdates = body.map(record => ({
            id: record.id,
            deleted_at: new Date().toISOString()
        }));

        result = await system.database.updateAll(schema!, permanentUpdates);
    }

    // Normal soft delete: set trashed_at = NOW()
    else {
        result = await system.database.deleteAll(schema!, body);
    }

    setRouteResult(context, result);
});
