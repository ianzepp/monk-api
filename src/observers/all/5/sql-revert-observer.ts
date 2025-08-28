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

export default class SqlRevertObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['revert'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema, data } = context;
        
        if (!data || data.length === 0) {
            context.result = [];
            return;
        }
        
        const ids = data.map((record: any) => record.id || record).filter((id: any) => id);
        if (ids.length === 0) {
            throw new SystemError('Revert records must have id fields');
        }
        
        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({
            id: { $in: ids }
        }, 0, {
            includeTrashed: true  // Include trashed records for revert operation
        });
        
        // Build revert query - only revert actually trashed records
        const fullWhereClause = `${whereClause} AND "trashed_at" IS NOT NULL`;
        const query = `UPDATE "${schema.table}" SET trashed_at = NULL, updated_at = NOW() WHERE ${fullWhereClause} RETURNING *`;
        const result = await SqlUtils.getDbContext(system).query(query, params);
        
        // ExistenceValidator already confirmed these are trashed records
        if (result.rows.length !== ids.length) {
            throw new SystemError(`Revert operation affected ${result.rows.length} records, expected ${ids.length}`);
        }
        
        context.result = result.rows.map((row: any) => SqlUtils.convertPostgreSQLTypes(row, schema));
    }
}