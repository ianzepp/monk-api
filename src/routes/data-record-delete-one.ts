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

            // Delete the record
            const deleteResult = await tx.execute(sql`
                DELETE FROM ${sql.identifier(tableName)}
                WHERE id = ${recordId}
                RETURNING id
            `);

            if (deleteResult.rows.length === 0) {
                throw new Error(`Record '${recordId}' not found`);
            }

            return { id: recordId, deleted: true };
        });

        return createSuccessResponse(c, result);
    } catch (error) {
        console.error('Error deleting record:', error);
        if (error instanceof Error) {
            if (error.message.includes('Schema') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Schema', schemaName);
            }
            if (error.message.includes('Record') && error.message.includes('not found')) {
                return createNotFoundError(c, 'Record', recordId);
            }
        }
        return createInternalError(c, 'Failed to delete record');
    }
}
