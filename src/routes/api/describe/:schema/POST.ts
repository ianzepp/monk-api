import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export default withTransactionParams(async (context, { system, schema, body }) => {
    // Schema name comes from URL parameter
    // Body contains schema metadata only (status, sudo, frozen)
    // Use column endpoints for column management
    const schemaName = schema!.toLowerCase();

    // Validate schema name mismatch (URL vs body)
    if (body.schema_name && body.schema_name.toLowerCase() !== schemaName) {
        const force = context.req.query('force') === 'true';
        if (!force) {
            throw HttpErrors.badRequest(
                `Schema name mismatch: URL has '${schemaName}' but body has '${body.schema_name}'. Use ?force=true to override.`
            );
        }
        // If force=true, use body's schema_name (will be spread below)
    }

    // Create schema record via wrapper
    const result = await system.describe.schemas.createOne({
        schema_name: schemaName,
        ...body
    });

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
