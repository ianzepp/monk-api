import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * DELETE /api/trashed/:model/:id - Permanently delete a specific trashed record
 *
 * Sets deleted_at on the record, making it permanently invisible.
 * Returns the permanently deleted record, or 404 if not found.
 * This action is irreversible.
 */
export default withTransaction(async ({ system, params }) => {
    const { model, id } = params;

    // Permanently delete by setting deleted_at
    const result = await system.database.updateOne(model, id, {
        deleted_at: new Date().toISOString()
    });

    return result;
});
