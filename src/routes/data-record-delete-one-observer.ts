/**
 * Observer-Enabled Data Record Delete One Route
 * 
 * DELETE /api/data/:schema/:id with observer pipeline integration
 */

import type { Context } from 'hono';
import { handleContextTx } from '@lib/api/responses.js';
import { 
    executeObserverPipeline, 
    handleObserverResult,
    loadExistingRecord 
} from '@lib/observers/route-integration.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system) => {
        const schemaName = context.req.param('schema');
        const recordId = context.req.param('id');

        console.debug('routes/data-record-delete-one-observer: schemaName=%j recordId=%j', schemaName, recordId);
        
        // Load existing record for observer context and audit trail
        const existing = await loadExistingRecord(system, schemaName, recordId);
        
        // Execute observer pipeline for delete operation
        const result = await executeObserverPipeline(
            system,
            'delete',
            schemaName,
            undefined, // No data for delete
            recordId,
            existing
        );

        return handleObserverResult(context, result);
    });
}