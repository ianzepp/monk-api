import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import type { FilterData } from '@src/lib/filter.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schema = context.req.param('schema');

    console.debug('routes/find-schema: schema=%j', schema);

    // Parse request body as FilterData
    const filterData: FilterData = await context.req.json();

    const result = await system.database.selectAny(schema, filterData, { context: 'api' });
    setRouteResult(context, result);
}
