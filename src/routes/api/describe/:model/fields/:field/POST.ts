import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { stripSystemFields } from '@src/lib/describe.js';

/**
 * POST /api/describe/:model/fields/:field
 *
 * Create a new field in Monk-native format
 *
 * Request body: Field definition in Monk format (type, required, etc.)
 * @returns Created field record from fields table
 */
export default withTransactionParams(async (context, { system, model, field, body }) => {
    const result = await system.describe.fields.createOne({
        model_name: model!,
        field_name: field!,
        ...body
    });

    // Strip system fields before returning
    setRouteResult(context, stripSystemFields(result));
});
