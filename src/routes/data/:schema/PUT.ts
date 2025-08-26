import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema, body, method }) => {
    // Always expect array input for PUT/PATCH /api/data/:schema
    if (!Array.isArray(body)) {
        throw new Error(`${method} /api/data/:schema expects an array of update records with id fields`);
    }
    
    let result;
    
    // Smart routing: PATCH + include_trashed=true = revert operation
    if (method === 'PATCH' && system.options.trashed === true) {
        result = await system.database.revertAll(schema!, body);
    } 
    
    // Normal update operation
    else {
        result = await system.database.updateAll(schema!, body);
    }
    
    setRouteResult(context, result);
});