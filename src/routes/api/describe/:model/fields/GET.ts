import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
/**
 * GET /api/describe/:model/fields - List all fields for a model
 *
 * Returns array of all field definitions for the specified model.
 */
export default withTransactionParams(async (context, { system, model }) => {
    const modelRecord = await system.describe.models.selectOne({ model: model });

    if (!modelRecord) {
        throw HttpErrors.notFound(`Model '${model}' not found`, 'MODEL_NOT_FOUND');
    }

    // Query fields table for all fields in this model
    const fields = await system.describe.fields.selectAny({
        where: { model_name: model },
        order: { field_name: 'asc' }
    });

    setRouteResult(context, fields);
});
