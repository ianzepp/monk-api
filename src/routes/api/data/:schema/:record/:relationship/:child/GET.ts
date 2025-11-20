import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /api/data/:schema/:record/:relationship/:child - Get specific related record
 * Returns a single child record, verifying both parent and child accessibility
 * @see docs/routes/DATA_API.md
 */
export default withParams(async (context, { system, schema, record, relationship, options }) => {
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

    // Get the specific child record, verifying it belongs to the parent
    const childRecord = await system.database.select404(childSchemaName, {
        where: {
            id: childId!,
            [foreignKeyColumn]: record // Ensure child belongs to this parent
        }
    }, undefined, options);

    setRouteResult(context, childRecord);
});