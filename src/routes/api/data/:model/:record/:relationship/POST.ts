import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/data/:model/:record/:relationship - Create a new related record
 * Creates a child record with the parent relationship automatically set
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, relationship, body, options }) => {
    // Verify parent record exists and is readable
    const parentRecord = await system.database.select404(model!, { where: { id: record! } }, undefined, options);

    // Get relationship metadata (cached)
    const rel = await system.database.getRelationship(model!, relationship!);

    // Ensure body is an object (not array)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be a single object for nested resource creation', 'INVALID_BODY_FORMAT');
    }

    // Create the child record with the parent relationship automatically set
    const recordData = {
        ...body,
        [rel.fieldName]: record // Set the foreign key to the parent record ID
    };

    const result = await system.database.createOne(rel.childModel, recordData);

    setRouteResult(context, result);
});
