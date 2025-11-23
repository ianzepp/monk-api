import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * DELETE /api/describe/:model/fields/:field
 *
 * Delete a field from the model
 *
 * @returns Deletion confirmation
 */
export default withTransactionParams(async (context, { system, model, field }) => {
    const result = await system.describe.fields.delete404(
        { where: { model_name: model, field_name: field } },
        `Field '${field}' not found in model '${model}'`
    );

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
