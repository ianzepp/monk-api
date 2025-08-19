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
        const body = await c.req.json();

        // Use transaction for write operation
        const result = await db.transaction(async (tx: TxContext) => {
            // Check if schema exists
            const schemaInfo = await tx
                .select()
                .from(dbSchema.schemas)
                .where(eq(dbSchema.schemas.name, schemaName))
                .limit(1);

            if (schemaInfo.length === 0) {
                throw new Error(`Schema '${schemaName}' not found`);
            }

            const tableName = schemaInfo[0].table_name;

            // Check if record exists
            const existingRecord = await tx.execute(sql`
                SELECT * FROM ${sql.identifier(tableName)}
                WHERE id = ${recordId}
                LIMIT 1
            `);

            if (existingRecord.rows.length === 0) {
                throw new Error(`Record '${recordId}' not found`);
            }

            // Update data (set updated_at since no trigger exists)
            const updateData = {
                ...body,
                updated_at: new Date().toISOString(),
            };

            // Build dynamic UPDATE query using Drizzle's proper API
            const setClauses: any[] = [];

            for (const [key, value] of Object.entries(updateData)) {
                if (
                    (key === 'access_read' ||
                        key === 'access_edit' ||
                        key === 'access_full' ||
                        key === 'access_deny') &&
                    Array.isArray(value)
                ) {
                    // Convert JavaScript array to PostgreSQL array literal format
                    const pgArrayLiteral = `{${value.join(',')}}`;
                    setClauses.push(sql`${sql.identifier(key)} = ${pgArrayLiteral}::uuid[]`);
                } else {
                    setClauses.push(sql`${sql.identifier(key)} = ${value}`);
                }
            }

            const updateResult = await tx.execute(sql`
                UPDATE ${sql.identifier(tableName)}
                SET ${sql.join(setClauses, sql`, `)}
                WHERE id = ${recordId}
                RETURNING *
            `);

            return updateResult.rows[0];
        });

        return createSuccessResponse(c, result);
    } catch (error) {
        console.error('Error updating record:', error);
        if (error instanceof Error) {
            if (error.message.includes('Schema') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Schema', schemaName);
            }
            if (error.message.includes('Record') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Record', recordId);
            }
        }
        return createInternalError(c, 'Failed to update record');
    }
}
