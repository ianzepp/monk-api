import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/data/:schema/:record/:relationship - Create a new related record
 * Creates a child record with the parent relationship automatically set
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, schema, record, relationship, body, options }) => {
    // Verify parent record exists and is readable
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
        throw HttpErrors.badRequest('Request body must be a single object for nested resource creation', 'INVALID_BODY_FORMAT');
    }

    // Create the child record with the parent relationship automatically set
    const recordData = {
        ...body,
        [foreignKeyColumn]: record // Set the foreign key to the parent record ID
    };

    const result = await system.database.createOne(childSchemaName, recordData);

    setRouteResult(context, result);
});