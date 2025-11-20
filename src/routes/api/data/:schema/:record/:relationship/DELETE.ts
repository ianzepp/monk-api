import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * DELETE /api/data/:schema/:record/:relationship - Delete all related records
 * Deletes all child records belonging to the parent relationship
 * @see docs/routes/DATA_API.md
 */
export default withTransactionParams(async (context, { system, schema, record, relationship, body, options }) => {
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

    // Delete all child records belonging to this parent
    const parentFilter = {
        where: {
            [foreignKeyColumn]: record // Scope to this parent only
        }
    };

    // Delete child records matching the parent constraint
    const result = await system.database.deleteAny(childSchemaName, parentFilter);

    setRouteResult(context, result);
});