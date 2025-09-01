import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { BulkProcessor } from '@src/lib/bulk-processor.js';

/**
 * POST /api/bulk - Execute multiple operations atomically
 * @see src/routes/bulk/PUBLIC.md
 */
export default withTransactionParams(async (context, { system, body }) => {
    const processor = new BulkProcessor(system);
    const operations = await processor.process(body);
    setRouteResult(context, operations);
});