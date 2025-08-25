import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';
import type { FilterData } from '@lib/filter.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('schema');
    
    console.debug('routes/find-schema: schemaName=%j', schemaName);
    
    // Parse request body as FilterData
    const filterData: FilterData = await context.req.json();
    
    const result = await system.database.selectAny(schemaName, filterData);
    setRouteResult(context, result);
}
