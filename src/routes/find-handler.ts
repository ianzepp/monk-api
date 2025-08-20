import type { Context } from 'hono';
import { System } from '../lib/system.js';
import {
    createSuccessResponse,
    createNotFoundError,
    createInternalError,
} from '../lib/api/responses.js';
import { db, builtins } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { Filter, type FilterData } from '../lib/filter.js';

export default async function (context: Context): Promise<any> {
    return await System.handleDb(context, async (system: System) => {
        const schemaName = context.req.param('schema');

        try {
            // Parse request body as FilterData
            const filterData: FilterData = await context.req.json();

            // Verify schema exists
            const schemaInfo = await db
                .select()
                .from(builtins.schemas)
                .where(eq(builtins.schemas.name, schemaName))
                .limit(1);

            if (schemaInfo.length === 0) {
                return createNotFoundError(context, 'Schema', schemaName);
            }

            const tableName = schemaInfo[0].table_name;

            // Create filter and apply conditions
            const filter = new Filter(system, schemaName, tableName);
            filter.assign(filterData);

            // Execute query
            const results = await filter.execute();

            return createSuccessResponse(context, results);
        } catch (error) {
            console.error('Error executing find query:', error);
            if (error instanceof Error && error.message.includes('not found')) {
                return createNotFoundError(context, 'Schema', schemaName);
            }
            return createInternalError(context, 'Failed to execute find query');
        }
    });
}
