import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schemaName }) => {
    const yamlContent = await system.metabase.selectOne(schemaName!);
    setRouteResult(context, yamlContent);
});
