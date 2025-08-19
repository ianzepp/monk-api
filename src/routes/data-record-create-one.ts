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

            // Generate new ID and add base fields (let DB handle timestamps)
            const recordData = {
                id: crypto.randomUUID(),
                domain: body.domain || null,
                access_read: body.access_read || [],
                access_edit: body.access_edit || [],
                access_full: body.access_full || [],
                access_deny: body.access_deny || [],
                ...body,
            };

            // Build dynamic INSERT query using Drizzle's proper API
            const columns: string[] = [];
            const valueParams: any[] = [];

            for (const [key, value] of Object.entries(recordData)) {
                columns.push(key);
                if (
                    (key === 'access_read' ||
                        key === 'access_edit' ||
                        key === 'access_full' ||
                        key === 'access_deny') &&
                    Array.isArray(value)
                ) {
                    // Convert JavaScript array to PostgreSQL array literal format
                    const pgArrayLiteral = `{${value.join(',')}}`;
                    valueParams.push(sql`${pgArrayLiteral}::uuid[]`);
                } else {
                    valueParams.push(sql`${value}`);
                }
            }

            const columnIdentifiers = columns.map((c) => sql.identifier(c));

            const insertResult = await tx.execute(sql`
                INSERT INTO ${sql.identifier(tableName)} 
                (${sql.join(columnIdentifiers, sql`, `)}) 
                VALUES (${sql.join(valueParams, sql`, `)})
                RETURNING *
            `);

            return insertResult.rows[0];
        });

        return createSuccessResponse(c, result, 201);
    } catch (error) {
        console.error('Error creating record:', error);
        if (error instanceof Error && error.message.includes('not found')) {
            return createNotFoundError(c, 'Schema', schemaName);
        }
        return createInternalError(c, 'Failed to create record');
    }
}
