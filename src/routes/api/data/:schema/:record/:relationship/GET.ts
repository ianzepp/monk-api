import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /api/data/:model/:record/:relationship - Get related records for a parent
 * Returns array of child records that have an owned relationship to the parent record
 * @see docs/routes/DATA_API.md
 */
export default withParams(async (context, { system, model, record, relationship, options }) => {
    // Verify parent record data is readable
    const recordData = await system.database.select404(model!, { where: { id: record! } }, undefined, options);

    // Query fields table to find child model with owned relationship to this parent
    // TODO: this needs to be abstracted later to a dedicated Database class method.
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

    // Query child records that reference this parent
    const result = await system.database.selectAny(childModelName, {
        where: { [foreignKeyField]: record }
    });

    setRouteResult(context, result);
});
