import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export default withTransactionParams(async (context, { system, schema, body }) => {
    // Schema name comes from URL parameter
    // Body contains schema metadata only (status, sudo, freeze)
    // Use column endpoints for column management
    const schemaName = schema!.toLowerCase();

    // Create schema record via wrapper
    const result = await system.describe.schemas.createOne({
        schema_name: schemaName,
        ...body
    });

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
