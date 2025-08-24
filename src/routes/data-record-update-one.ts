import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('schema');
    const recordId = context.req.param('id');            
    const recordData = await context.req.json();
    const method = context.req.method;

    console.debug('routes/data-record-update-one: method=%j schemaName=%j recordId=%j recordData=%j options=%j', 
        method, schemaName, recordId, recordData, system.options);
    
    let result;
    // Smart routing: PATCH + include_trashed=true = revert operation
    if (method === 'PATCH' && system.options.trashed === true) {
        console.debug('routes/data-record-update-one: routing to revertOne() for revert operation');
        result = await system.database.revertOne(schemaName, recordId);
    } else {
        console.debug('routes/data-record-update-one: routing to updateOne() for normal update');
        result = await system.database.updateOne(schemaName, recordId, recordData);
    }
    
    setRouteResult(context, result);
}
