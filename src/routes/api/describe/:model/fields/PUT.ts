import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/describe/:model/fields
 *
 * Update multiple fields in bulk
 *
 * Request body: Array of field updates
 * Each field must have: field_name (and any fields to update: type, required, default_value, etc.)
 * @returns Array of updated field records from fields table
 */
export default withTransactionParams(async (context, { system, model, body }) => {
    // TODO: Complete implementation - need to map field_name to id using model cache
    throw HttpErrors.notImplemented(
        'Bulk field update endpoint is incomplete - use PUT /api/describe/:model/fields/:field for single field updates',
        'ENDPOINT_INCOMPLETE'
    );

    // Validate body is an array
    if (!Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an array of field updates');
    }

    // Validate each field has field_name
    for (const field of body as any[]) {
        if (!field.field_name) {
            throw HttpErrors.badRequest('Each field update must include field_name');
        }
    }

    // Inject model_name into each field update
    const fieldsToUpdate = body.map((field: any) => ({
        model_name: model!,
        ...field
    }));

    console.log('PUT /api/describe/:model/fields - Updating fields in bulk:', {
        model: model!,
        fieldCount: fieldsToUpdate.length
    });

    const results = await system.describe.fields.updateAll(fieldsToUpdate);

    // Strip system fields from all results
    setRouteResult(context, results.map(stripSystemFields));
});
