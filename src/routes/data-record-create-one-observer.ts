/**
 * Observer-Enabled Data Record Create One Route
 * 
 * POST /api/data/:schema/:id with observer pipeline integration  
 */

import type { Context } from 'hono';
import { handleContextTx } from '@lib/api/responses.js';
import { 
    executeObserverPipeline, 
    handleObserverResult 
} from '@lib/observers/route-integration.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const recordData = await context.req.json();
        
        console.debug('routes/data-record-create-one-observer: schemaName=%j', schemaName);

        // Execute observer pipeline for single create operation
        const result = await executeObserverPipeline(
            system,
            'create',
            schemaName,
            recordData
        );

        return handleObserverResult(context, result, 201);
    });
}