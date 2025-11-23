import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * PUT /api/describe/:model/fields/:field
 *
 * Update an existing field in Monk-native format
 *
 * Request body: Field definition updates in Monk format
 * @returns Updated field record from fields table
 */
export default withTransactionParams(async (context, { system, model, field, body }) => {
    const result = await system.describe.fields.update404(
        { where: { model_name: model, field_name: field } },
        body,
        `Field '${field}' not found in model '${model}'`
    );

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
