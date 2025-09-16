/**
 * SQL Delete Pipeline - Ring 5 Database Transport Layer
 *
 * Handles DELETE operations - direct SQL execution for soft deleting records.
 * Operates on pre-validated records from earlier observer rings.
 */

import type { PipelineContext } from '@src/lib/pipeline/interfaces.js';
import { BaseObserver } from '@src/lib/pipeline/base-observer.js';
import { PipelineRing } from '@src/lib/pipeline/types.js';
import { SystemError } from '@src/lib/pipeline/errors.js';
import { SqlUtils } from '@src/lib/pipeline/sql-utils.js';
import { FilterWhere } from '@src/lib/filter-where.js';

export default class SqlDeletePipeline extends BaseObserver {
    readonly ring = PipelineRing.Database;
    readonly operations = ['delete'] as const;

    async execute(context: PipelineContext): Promise<void> {
        const { system, schema, data } = context;

        if (!data || data.length === 0) {
            context.result = [];
            return;
        }

        const ids = data.map((record: any) => record.id).filter((id: any) => id);
        if (ids.length === 0) {
            throw new SystemError('Delete records must have id fields');
        }

        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({
            id: { $in: ids },
        });

        const query = `UPDATE "${schema.table}" SET trashed_at = NOW(), updated_at = NOW() WHERE ${whereClause} RETURNING *`;
        const result = await SqlUtils.getPool(system).query(query, params);

        // Existence validation already confirmed these records exist
        if (result.rows.length !== ids.length) {
            throw new SystemError(`Delete operation affected ${result.rows.length} records, expected ${ids.length}`);
        }

        context.result = result.rows.map((row: any) => SqlUtils.convertPostgreSQLTypes(row, schema));
    }
}
