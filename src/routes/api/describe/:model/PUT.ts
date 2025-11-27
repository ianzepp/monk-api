import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * PUT /api/describe/:model - Update model metadata
 *
 * Updates model properties like status, sudo, frozen.
 * Does not modify fields - use field endpoints for that.
 */
export default withTransactionParams(async (context, { system, model, body }) => {
    const result = await system.describe.models.update404(
        { where: { model_name: model } },
        body,
        `Model '${model}' not found`
    );
    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
