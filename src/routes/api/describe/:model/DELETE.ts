import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * DELETE /api/describe/:model - Delete model
 *
 * Soft deletes model and drops table via observer pipeline.
 */
export default withTransactionParams(async (context, { system, model }) => {
    const result = await system.describe.models.delete404(
        { where: { model_name: model } },
        `Model '${model}' not found`
    );

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
