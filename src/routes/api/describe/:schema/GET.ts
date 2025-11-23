import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * GET /api/describe/:model - Get model metadata
 *
 * Returns model record only (without fields).
 * Use GET /api/describe/:model/fields/:field for individual field definitions.
 */
export default withParams(async (context, { system, model }) => {
    const result = await system.describe.models.select404(
        { where: { model_name: model } },
        `Model '${model}' not found`
    );

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
