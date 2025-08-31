import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema }) => {
    // Delete schema via Metabase
    const result = await system.metabase.deleteOne(schema!);

    // Set result for middleware formatting (DELETE returns JSON, not YAML)
    setRouteResult(context, result);
});
