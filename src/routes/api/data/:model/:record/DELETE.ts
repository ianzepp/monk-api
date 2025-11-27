import { withTransaction } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * DELETE /api/data/:model/:record - Delete single record by ID
 * @see docs/routes/DATA_API.md
 */
export default withTransaction(async ({ system, params, query }) => {
    const { model, record } = params;
    const isPermanent = query.permanent === 'true';

    let result;

    // Permanent delete: set deleted_at = NOW()
    if (isPermanent) {
        // Check root access for permanent deletes
        if (!system.isRoot()) {
            throw HttpErrors.forbidden('Insufficient permissions for permanent delete', 'ACCESS_DENIED');
        }

        result = await system.database.updateOne(model!, record!, { deleted_at: new Date().toISOString() });
    }

    // Normal soft delete: set trashed_at = NOW()
    else {
        result = await system.database.delete404(model!, { where: { id: record! } });
    }

    return result;
});
