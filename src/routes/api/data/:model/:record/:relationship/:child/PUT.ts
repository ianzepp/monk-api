import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/context-initializer.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/data/:model/:record/:relationship/:child - Update specific related record
 * Updates a single child record, verifying both parent accessibility and child ownership
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, relationship, body, options }) => {
    const childId = context.req.param('child');

    // Verify parent record data is readable
    const parentRecord = await system.database.select404(model!, { where: { id: record! } }, undefined, options);

    // Get relationship metadata (cached)
    const rel = await system.database.getRelationship(model!, relationship!);

    // Ensure body is an object (not array)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be a single object for nested resource update', 'INVALID_BODY_FORMAT');
    }

    // Prepare update data, ensuring the foreign key is preserved
    const updateData = {
        ...body,
        [rel.fieldName]: record // Ensure foreign key remains linked to parent
    };

    // Update the child record, verifying it exists and belongs to this parent
    const result = await system.database.update404(rel.childModel, {
        where: {
            id: childId!,
            [rel.fieldName]: record // Ensure child belongs to this parent
        }
    }, updateData);

    setRouteResult(context, result);
});
