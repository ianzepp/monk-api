import { Hono, type Context } from 'hono';
import { db, type TxContext } from '../db/index.js';
import {
    createSuccessResponse,
    createNotFoundError,
    createValidationError,
    createInternalError,
} from '../lib/api/responses.js';
import { eq, sql } from 'drizzle-orm';
import { schema as dbSchema } from '../db/index.js';

export default async function (c: Context): Promise<any> {
    const schemaName = c.req.param('schema');

    try {
        // Check if schema exists and get table info
        const schemaInfo = await db
            .select()
            .from(dbSchema.schemas)
            .where(eq(dbSchema.schemas.name, schemaName))
            .limit(1);

        if (schemaInfo.length === 0) {
            return createNotFoundError(c, 'Schema', schemaName);
        }

        const tableName = schemaInfo[0].table_name;

        // Query the dynamic table directly
        // Note: In a real implementation, we'd build this query dynamically
        // For now, we'll use raw SQL to query the dynamic table
        const result = await db.execute(sql`
            SELECT * FROM ${sql.identifier(tableName)}
            ORDER BY created_at DESC
        `);

        return createSuccessResponse(c, result.rows);
    } catch (error) {
        console.error('Error listing records:', error);
        return createInternalError(c, 'Failed to list records');
    }
}
