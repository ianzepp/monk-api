/**
 * SQL Revert Observer - Ring 5 Database Transport Layer
 *
 * Handles REVERT operations - direct SQL execution for undoing soft deletes.
 * Operates on pre-validated trashed records from earlier observer rings.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { FilterWhere } from '@src/lib/filter-where.js';
import type { ModelRecord } from '@src/lib/model-record.js';

export default class SqlRevertObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['revert'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, model, data } = context;

        if (!data || data.length === 0) {
            return;
        }

        // Build Map for O(1) lookup when matching DB results back to ModelRecord instances
        const dataMap = new Map<string, ModelRecord>();
        const ids: string[] = [];

        for (const record of data) {
            const id = record.get('id');
            if (!id) {
                throw new SystemError('Revert records must have id fields');
            }
            dataMap.set(id, record);
            ids.push(id);
        }

        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate(
            {
                id: { $in: ids },
            },
            0,
            {
                trashed: 'include', // Include trashed records for revert operation
            }
        );

        // Build revert query - only revert actually trashed records
        const fullWhereClause = `${whereClause} AND "trashed_at" IS NOT NULL`;
        const query = `UPDATE "${model.model_name}" SET trashed_at = NULL, updated_at = NOW() WHERE ${fullWhereClause} RETURNING *`;
        const result = await SqlUtils.getPool(system).query(query, params);

        // ExistenceValidator already confirmed these are trashed records
        if (result.rows.length !== ids.length) {
            throw new SystemError(`Revert operation affected ${result.rows.length} records, expected ${ids.length}`);
        }

        // Update each ModelRecord with final database state
        for (const row of result.rows) {
            const dbResult = SqlUtils.convertPostgreSQLTypes(row, model);
            const record = dataMap.get(dbResult.id);
            if (record) {
                record.setCurrent(dbResult);
            }
        }

        // No need to set context.result - context.data now contains updated ModelRecord instances
    }
}
