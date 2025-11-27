import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { isSystemField, stripSystemFields } from '@src/lib/describe.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /api/describe/:model/fields/:field
 *
 * Retrieve field definition in Monk-native format
 *
 * @returns Field record from fields table
 */
export default withTransactionParams(async (context, { system, model, field }) => {
    // Reject requests for system fields - Describe API is for portable definitions only
    if (isSystemField(field!)) {
        throw HttpErrors.notFound(
            `Field '${field}' is a system field and not available via Describe API`,
            'SYSTEM_FIELD_NOT_ACCESSIBLE'
        );
    }

    const fieldDef = await system.describe.fields.select404(
        { where: { model_name: model, field_name: field } },
        `Field '${field}' not found in model '${model}'`
    );
    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(fieldDef));
});
