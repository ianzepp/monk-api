import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export default withTransactionParams(async (context, { system, model, body }) => {
    // Model name comes from URL parameter
    // Body contains model metadata only (status, sudo, frozen)
    // Use field endpoints for field management
    const modelName = model!.toLowerCase();

    // Validate model name mismatch (URL vs body)
    if (body.model_name && body.model_name.toLowerCase() !== modelName) {
        const force = context.req.query('force') === 'true';
        if (!force) {
            throw HttpErrors.badRequest(
                `Model name mismatch: URL has '${modelName}' but body has '${body.model_name}'. Use ?force=true to override.`
            );
        }
        // If force=true, use body's model_name (will be spread below)
    }

    // Create model record via wrapper
    const dataToCreate = {
        model_name: modelName,
        ...body
    };

    console.log('POST /api/describe/:model - Creating model:', {
        modelFromUrl: modelName,
        body,
        dataToCreate
    });

    const result = await system.describe.models.createOne(dataToCreate);

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
