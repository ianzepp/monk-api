import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export default withTransactionParams(async (context, { system, schema, body }) => {
    // Schema name comes from URL parameter
    // Body contains Monk-native format with optional columns array
    const schemaName = schema!.toLowerCase();

    // Create schema via Describe using the URL schema name
    const result = await system.describe.createSchema(schemaName, body);

    // Set result for middleware formatting
    setRouteResult(context, result);
});
