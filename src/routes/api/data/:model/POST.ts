import { withTransaction } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/data/:model - Create or upsert multiple records in model
 *
 * Default behavior: Create new records (all must be new)
 * With ?upsert=true: Insert new records OR update existing (by ID presence)
 *
 * @see docs/routes/DATA_API.md
 */
export default withTransaction(async ({ system, params, query, body }) => {
    const { model } = params;

    // Always expect array input for POST /api/data/:model
    if (!Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
    }

    const upsert = query.upsert === 'true';
    return upsert
        ? await system.database.upsertAll(model, body)
        : await system.database.createAll(model, body);
});
