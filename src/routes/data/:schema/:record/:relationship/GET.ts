import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /api/data/:schema/:record/:relationship - Get related records for a parent
 * Returns array of child records that have an owned relationship to the parent record
 * @see docs/routes/DATA_API.md
 */
export default withParams(async (context, { system, schema, record, relationship, options }) => {
    // Verify parent record data is readable
    const recordData = await system.database.select404(schema!, { where: { id: record! } }, undefined, options);

    // Query columns table to find child schema with owned relationship to this parent
    // TODO: this needs to be abstracted later to a dedicated Database class method.
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

    // Query child records that reference this parent
    const result = await system.database.selectAny(childSchemaName, {
        where: { [foreignKeyColumn]: record }
    });

    setRouteResult(context, result);
});
