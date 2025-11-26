import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/data/:model/:record/:relationship - Bulk update child records
 *
 * Updates multiple child records belonging to the parent relationship.
 * Body should be an array of child records with IDs.
 *
 * @see docs/routes/DATA_API.md
 * @todo Implement bulk child update functionality
 */
export default withTransactionParams(async (context, { system, model, record, relationship, body }) => {
    throw HttpErrors.notImplemented(
        'Bulk relationship update not yet implemented. Use individual child updates via /:child endpoint.',
        'NOT_IMPLEMENTED'
    );
});
