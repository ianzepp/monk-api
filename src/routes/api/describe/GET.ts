import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

/**
 * GET /api/describe - List all model names
 * @see docs/31-describe-api.md
 */
export default withTransactionParams(async (context, { system }) => {
    const models = await system.describe.models.selectAny({ order: { model_name: 'asc' } });
    // Extract just the model names from the full model objects
    const modelNames = models.map((model: any) => model.model_name);
    setRouteResult(context, modelNames);
});
