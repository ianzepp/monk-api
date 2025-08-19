import type { Context } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { Filter, type FilterData } from '../lib/filter.js';
import {
    createSuccessResponse,
    createNotFoundError,
    createValidationError,
    createInternalError,
} from '../lib/api/responses.js';

export default async function (c: Context): Promise<any> {
    const schemaName = c.req.param('schema');

    try {
        // Parse request body as FilterData
        const filterData: FilterData = await c.req.json();

        // Verify schema exists
        const schemaInfo = await db
            .select()
            .from(schema.schemas)
            .where(eq(schema.schemas.name, schemaName))
            .limit(1);

        if (schemaInfo.length === 0) {
            return createNotFoundError(c, 'Schema', schemaName);
        }

        const tableName = schemaInfo[0].table_name;

        // Create filter and apply conditions
        const filter = new Filter(schemaName, tableName, db);
        filter.assign(filterData);

        // Execute query
        const results = await filter.execute();

        return createSuccessResponse(c, results);
    } catch (error) {
        console.error('Error executing find query:', error);
        if (error instanceof Error && error.message.includes('not found')) {
            return createNotFoundError(c, 'Schema', schemaName);
        }
        return createInternalError(c, 'Failed to execute find query');
    }
}