/**
 * Observer-Enabled Data Record Update One Route
 * 
 * PUT/PATCH /api/data/:schema/:id with observer pipeline integration
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
        const recordData = await context.req.json();
        const method = context.req.method;

        console.debug('routes/data-record-update-one-observer: method=%j schemaName=%j recordId=%j recordData=%j options=%j', 
            method, schemaName, recordId, recordData, system.options);
        
        // Smart routing: PATCH + include_trashed=true = revert operation
        if (method === 'PATCH' && system.options.trashed === true) {
            console.debug('routes/data-record-update-one-observer: routing to revertOne() for revert operation');
            // Revert operations bypass observer system for now (special case)
            return await system.database.revertOne(schemaName, recordId);
        }
        
        // Load existing record for observer context
        const existing = await loadExistingRecord(system, schemaName, recordId);
        
        console.debug('routes/data-record-update-one-observer: executing observer pipeline for update');
        
        // Execute observer pipeline for update operation
        const result = await executeObserverPipeline(
            system,
            'update',
            schemaName,
            recordData,
            recordId,
            existing
        );

        return handleObserverResult(context, result);
    });
}