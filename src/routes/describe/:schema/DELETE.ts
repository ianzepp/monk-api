import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withTransactionParams(async (context, { system, schema }) => {
    // Delete schema via Describe
    const result = await system.describe.deleteSchema(schema!);

    // Set result for middleware formatting (DELETE returns JSON, not JSON)
    setRouteResult(context, result);
});
