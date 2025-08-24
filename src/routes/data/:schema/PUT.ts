import type { Context } from 'hono';
import { setRouteResult } from '@lib/middleware/system-context.js';

export default async function (context: Context) {
    const system = context.get('system');
    const schemaName = context.req.param('schema');
    const updateList = await context.req.json();
    const method = context.req.method;

    // Always expect array input for PUT/PATCH /api/data/:schema
    if (!Array.isArray(updateList)) {
        throw new Error(`${method} /api/data/:schema expects an array of update records with id fields`);
    }
    
    console.debug('routes/data-record-update-all: method=%j schemaName=%j updateCount=%d options=%j', 
        method, schemaName, updateList.length, system.options);

    let result;
    // Smart routing: PATCH + include_trashed=true = revert operation
    if (method === 'PATCH' && system.options.trashed === true) {
        console.debug('routes/data-record-update-all: routing to revertAll() for revert operation');
        result = await system.database.revertAll(schemaName, updateList);
    } else {
        console.debug('routes/data-record-update-all: routing to updateAll() for normal update');
        result = await system.database.updateAll(schemaName, updateList);
    }
    
    setRouteResult(context, result);
}