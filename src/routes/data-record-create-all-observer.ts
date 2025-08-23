/**
 * Observer-Enabled Data Record Create All Route
 * 
 * POST /api/data/:schema with observer pipeline integration
 */

import type { Context } from 'hono';
import { handleContextTx } from '@lib/api/responses.js';
import { 
    executeObserverPipelineBatch, 
    handleBatchObserverResult 
} from '@lib/observers/route-integration.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const recordList = await context.req.json();

        // Always expect array input for POST /api/data/:schema
        if (!Array.isArray(recordList)) {
            throw new Error('POST /api/data/:schema expects an array of records');
        }
        
        console.debug('routes/data-record-create-all-observer: schemaName=%j recordCount=%d', schemaName, recordList.length);

        // Execute observer pipeline for batch create operation
        const result = await executeObserverPipelineBatch(
            system,
            'create',
            schemaName,
            recordList
        );

        return handleBatchObserverResult(context, result, 201);
    });
}