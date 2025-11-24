import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * DELETE /api/data/:model/:record/:relationship/:child - Delete specific related record
 * Deletes a single child record, verifying both parent accessibility and child ownership
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, model, record, relationship, options }) => {
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
    const relationshipResult = await system.tx.query(relationshipQuery, [model, relationship]);

    if (relationshipResult.rows.length === 0) {
        throw HttpErrors.notFound(`Relationship '${relationship}' not found for model '${model}'`, 'RELATIONSHIP_NOT_FOUND');
    }

    const { field_name: foreignKeyField, model_name: childModelName } = relationshipResult.rows[0];

    // Delete the child record, verifying it exists and belongs to this parent
    const result = await system.database.delete404(childModelName, {
        where: {
            id: childId!,
            [foreignKeyField]: record // Ensure child belongs to this parent
        }
    });

    setRouteResult(context, result);
});
