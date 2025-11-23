import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { ModelCache } from '@src/lib/model-cache.js';
/**
 * GET /api/describe/:model/fields - List all fields for a model
 *
 * Returns array of all field definitions for the specified model.
 */
export default withParams(async (context, { system, model }) => {
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
