import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schemaName, body }) => {
    logger.info('Meta schema put', { schemaName });
    // body is automatically raw YAML string for text/yaml content-type
    await system.metabase.updateOne(schemaName!, body);
    setRouteResult(context, body);
});
