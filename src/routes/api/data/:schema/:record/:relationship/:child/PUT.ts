import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
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

    // Query fields table to find child model with owned relationship to this parent
    const relationshipQuery = `
        SELECT field_name, model_name, relationship_type
        FROM fields
        WHERE related_model = $1
          AND relationship_name = $2
          AND relationship_type = 'owned'
    `;
    const relationshipResult = await system.db.query(relationshipQuery, [model, relationship]);

    if (relationshipResult.rows.length === 0) {
        throw HttpErrors.notFound(`Relationship '${relationship}' not found for model '${model}'`, 'RELATIONSHIP_NOT_FOUND');
    }

    const { field_name: foreignKeyField, model_name: childModelName } = relationshipResult.rows[0];

    // Ensure body is an object (not array)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be a single object for nested resource update', 'INVALID_BODY_FORMAT');
    }

    // Prepare update data, ensuring the foreign key is preserved
    const updateData = {
        ...body,
        [foreignKeyField]: record // Ensure foreign key remains linked to parent
    };

    // Update the child record, verifying it exists and belongs to this parent
    const result = await system.database.update404(childModelName, {
        where: {
            id: childId!,
            [foreignKeyField]: record // Ensure child belongs to this parent
        }
    }, updateData);

    setRouteResult(context, result);
});
