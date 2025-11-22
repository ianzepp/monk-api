/**
 * SQL Select Observer - Ring 5 Database Transport Layer
 *
 * Handles SELECT operations - direct SQL execution for querying records.
 * Executes SELECT queries with proper WHERE clause generation and ordering.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { FilterWhere } from '@src/lib/filter-where.js';
import { SchemaRecord } from '@src/lib/schema-record.js';

export default class SqlSelectObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['select'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema } = context;

        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({}); // Default filtering for soft deletes

        const query = `SELECT * FROM "${schema.schema_name}" WHERE ${whereClause} ORDER BY "created_at" DESC`;
        const result = await SqlUtils.getPool(system).query(query, params);

        // Replace context.data with new SchemaRecord instances from query results
        context.data = result.rows.map((row: any) => {
            const dbResult = SqlUtils.convertPostgreSQLTypes(row, schema);
            return new SchemaRecord(schema, dbResult);
        });
    }
}
