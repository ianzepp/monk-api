import type { Context } from 'hono';
import { withParams } from '@src/lib/route-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema, recordId, body, method }) => {
    let result;
    
    // Smart routing: PATCH + include_trashed=true = revert operation
    if (method === 'PATCH' && system.options.trashed === true) {
        result = await system.database.revertOne(schema!, recordId!);
    } 
    
    // Normal update operation
    else {
        result = await system.database.updateOne(schema!, recordId!, body);
    }
    
    setRouteResult(context, result);
});
