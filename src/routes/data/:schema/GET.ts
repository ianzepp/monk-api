import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema }) => {
    logger.info('Data record select any', { schema });
    const result = await system.database.selectAny(schema!);
    setRouteResult(context, result);
});
