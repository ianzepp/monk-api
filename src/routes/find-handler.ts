import type { Context } from 'hono';
import { System } from '@lib/system.js';
import {
    createSuccessResponse,
    createNotFoundError,
    createInternalError,
} from '@lib/api/responses.js';
import { builtins } from '@src/db/index.js';
import type { FilterData } from '@lib/filter.js';
import { handleContextDb } from '@lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextDb(context, async (system: System) => {
        const schemaName = context.req.param('schema');

        try {
            // Parse request body as FilterData
            const filterData: FilterData = await context.req.json();

            // Verify schema exists using raw SQL
            const schemaQuery = `
                SELECT name, table_name 
                FROM ${builtins.TABLE_NAMES.schema} 
                WHERE name = $1 
                LIMIT 1
            `;
            
            const result = await system.database.execute(schemaQuery, [schemaName]);

            if (result.rows.length === 0) {
                return createNotFoundError(context, 'Schema', schemaName);
            }

            const tableName = result.rows[0].table_name;

            // Issue #102: Use Database.selectAny() instead of direct filter.execute()
            // This uses the toSQL() pattern and prepares for future observer pipeline integration
            const results = await system.database.selectAny(schemaName, filterData);

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
