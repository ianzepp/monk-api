import type { Context } from 'hono';
import { db, schema, type TxContext } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import {
    createSuccessResponse,
    createNotFoundError,
    createDependencyError,
    createInternalError,
} from '../lib/api/responses.js';

export default async function (c: Context): Promise<any> {
    const schemaName = c.req.param('name');

    try {
        // Use transaction for write operation
        const result = await db.transaction(async (tx: TxContext) => {
            // 1. Get schema info before deletion
            const schemaRecord = await tx
                .select()
                .from(schema.schemas)
                .where(eq(schema.schemas.name, schemaName))
                .limit(1);

            if (schemaRecord.length === 0) {
                throw new Error(`Schema not found: ${schemaName}`);
            }

            const tableName = schemaRecord[0].table_name;

            // 2. Check for dependent schemas (foreign key references to this table)
            const dependentSchemas = await tx
                .select({
                    schemaName: schema.schemas.name,
                    tableName: schema.schemas.table_name
                })
                .from(schema.schemas)
                .where(sql`definition::text LIKE ${`%"table": "${tableName}"%`}`);

            if (dependentSchemas.length > 0) {
                const dependentNames = dependentSchemas.map(s => s.schemaName).join(', ');
                throw new Error(`Cannot delete schema '${schemaName}' - referenced by: ${dependentNames}. Delete dependent schemas first.`);
            }

            // 3. Drop the actual table
            await tx.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)}`);

            // 4. Delete column records
            await tx
                .delete(schema.columns)
                .where(eq(schema.columns.schema_name, schemaName));

            // 5. Delete schema record
            await tx
                .delete(schema.schemas)
                .where(eq(schema.schemas.name, schemaName));

            return {
                deleted_schema: schemaName,
                dropped_table: tableName,
                deleted_at: new Date().toISOString(),
            };
        });

        return createSuccessResponse(c, result);
    } catch (error) {
        console.error('Error deleting schema:', error);
        if (error instanceof Error && error.message.includes('referenced by:')) {
            const dependencyMatch = error.message.match(/referenced by: ([^.]+)/);
            const dependencies = dependencyMatch ? dependencyMatch[1].split(', ') : [];
            return createDependencyError(c, `schema '${schemaName}'`, dependencies);
        }
        if (error instanceof Error && error.message.includes('not found')) {
            return createNotFoundError(c, 'Schema', schemaName);
        }
        return createInternalError(c, 'Failed to delete schema');
    }
}