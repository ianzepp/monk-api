/**
 * SQL Select Pipeline - Ring 5 Database Transport Layer
 *
 * Handles SELECT operations - direct SQL execution for querying records.
 * Executes SELECT queries with proper WHERE clause generation and ordering.
 */

import type { PipelineContext } from '@src/lib/pipeline/interfaces.js';
import { BaseObserver } from '@src/lib/pipeline/base-observer.js';
import { PipelineRing } from '@src/lib/pipeline/types.js';
import { SqlUtils } from '@src/lib/pipeline/sql-utils.js';
import { FilterWhere } from '@src/lib/filter-where.js';

export default class SqlSelectPipeline extends BaseObserver {
    readonly ring = PipelineRing.Database;
    readonly operations = ['select'] as const;

    async execute(context: PipelineContext): Promise<void> {
        const { system, schema, data } = context;

        if (!data || data.length === 0) {
            context.result = [];
            return;
        }

        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({}); // Default filtering for soft deletes

        const query = `SELECT * FROM "${schema.table}" WHERE ${whereClause} ORDER BY "created_at" DESC`;
        const result = await SqlUtils.getPool(system).query(query, params);

        context.result = result.rows.map((row: any) => SqlUtils.convertPostgreSQLTypes(row, schema));
    }
}
