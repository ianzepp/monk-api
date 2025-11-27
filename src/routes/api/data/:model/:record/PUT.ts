import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * PUT /api/data/:model/:id - Update single record by ID
 * @see docs/routes/DATA_API.md
 */
export default withTransaction(async ({ system, params, body, method }) => {
    const { model, record } = params;
    let result;

    // Smart routing: PATCH + include_trashed=true = revert operation
    if (method === 'PATCH' && system.options.trashed === true) {
        result = await system.database.revertOne(model!, record!);
    }

    // Normal update operation
    else {
        result = await system.database.updateOne(model!, record!, body);
    }

    return result;
});
