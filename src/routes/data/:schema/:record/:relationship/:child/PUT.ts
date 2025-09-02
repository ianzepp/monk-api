import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/data/:schema/:record/:relationship/:child - Update specific related record
 * Updates a single child record, verifying both parent accessibility and child ownership
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, schema, record, relationship, body, options }) => {
    const childId = context.req.param('child');

    // Verify parent record data is readable
    const parentRecord = await system.database.select404(schema!, { where: { id: record! } }, undefined, options);

    // Query columns table to find child schema with owned relationship to this parent
    const relationshipQuery = `
        SELECT column_name, schema_name, relationship_type
        FROM columns
        WHERE related_schema = $1
          AND relationship_name = $2
          AND relationship_type = 'owned'
    `;
    const relationshipResult = await system.db.query(relationshipQuery, [schema, relationship]);

    if (relationshipResult.rows.length === 0) {
        throw HttpErrors.notFound(`Relationship '${relationship}' not found for schema '${schema}'`, 'RELATIONSHIP_NOT_FOUND');
    }

    const { column_name: foreignKeyColumn, schema_name: childSchemaName } = relationshipResult.rows[0];

    // Ensure body is an object (not array)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be a single object for nested resource update', 'INVALID_BODY_FORMAT');
    }

    // Prepare update data, ensuring the foreign key is preserved
    const updateData = {
        ...body,
        [foreignKeyColumn]: record // Ensure foreign key remains linked to parent
    };

    // Update the child record, verifying it exists and belongs to this parent
    const result = await system.database.update404(childSchemaName, {
        where: {
            id: childId!,
            [foreignKeyColumn]: record // Ensure child belongs to this parent
        }
    }, updateData);

    setRouteResult(context, result);
});