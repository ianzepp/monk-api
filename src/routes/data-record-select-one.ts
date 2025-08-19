import { db, type TxContext } from '../db/index.js';
import {
    createSuccessResponse,
    createNotFoundError,
    createValidationError,
    createInternalError,
} from '../lib/api/responses.js';
import { eq, sql } from 'drizzle-orm';
import { schema as dbSchema } from '../db/index.js';

export default async function (c: any): Promise<any> {
    const schemaName = c.req.param('schema');
    const recordId = c.req.param('id');

    try {
        // Check if schema exists
        const schemaInfo = await db
            .select()
            .from(dbSchema.schemas)
            .where(eq(dbSchema.schemas.name, schemaName))
            .limit(1);

        if (schemaInfo.length === 0) {
            return createNotFoundError(c, 'Schema', schemaName);
        }

        const tableName = schemaInfo[0].table_name;

        // Query for specific record
        const result = await db.execute(sql`
            SELECT * FROM ${sql.identifier(tableName)}
            WHERE id = ${recordId}
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            return createNotFoundError(c, 'Record', recordId);
        }

        return createSuccessResponse(c, result.rows[0]);
    } catch (error) {
        console.error('Error getting record:', error);
        return createInternalError(c, 'Failed to get record');
    }
}
