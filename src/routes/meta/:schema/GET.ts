import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema }) => {
    const yamlContent = await system.metabase.selectOne(schema!);
    setRouteResult(context, yamlContent);
});
