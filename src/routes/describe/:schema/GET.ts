import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { isSystemField } from '@src/lib/describe.js';

export default withParams(async (context, { system, schema }) => {
    const result = await system.describe.selectSchema(schema!);

    // // Filter out system columns for portable schema representation
    // if (jsonContent.columns) {
    //     jsonContent.columns = jsonContent.columns.filter((col: any) => !isSystemField(col.column_name));
    // }

    // // Build portable schema response using only fields defined in columns table
    // // This ensures the Describe API returns only portable, user-defined fields
    // const portableSchema: Record<string, any> = {};

    // // Always include the columns array
    // portableSchema.columns = jsonContent.columns;

    // // Include only schema fields that have corresponding column definitions
    // for (const column of jsonContent.columns) {
    //     const fieldName = column.column_name;
    //     if (fieldName in jsonContent) {
    //         portableSchema[fieldName] = jsonContent[fieldName];
    //     }
    // }

    setRouteResult(context, result);
});
