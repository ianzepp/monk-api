import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema }) => {
    const jsonContent = await system.describe.selectOne(schema!);
    setRouteResult(context, jsonContent);
});
