/**
 * SQL Delete Observer - Ring 5 Database Transport Layer
 *
 * Handles DELETE operations - direct SQL execution for soft deleting records.
 * Operates on pre-validated records from earlier observer rings.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { FilterWhere } from '@src/lib/filter-where.js';
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class SqlDeleteObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema, data } = context;

        if (!data || data.length === 0) {
            return;
        }

        // Build Map for O(1) lookup when matching DB results back to SchemaRecord instances
        const dataMap = new Map<string, SchemaRecord>();
        const ids: string[] = [];

        for (const record of data) {
            const id = record.get('id');
            if (!id) {
                throw new SystemError('Delete records must have id fields');
            }
            dataMap.set(id, record);
            ids.push(id);
        }

        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({
            id: { $in: ids },
        });

        const query = `UPDATE "${schema.schema_name}" SET trashed_at = NOW(), updated_at = NOW() WHERE ${whereClause} RETURNING *`;
        const result = await SqlUtils.getPool(system).query(query, params);

        // Existence validation already confirmed these records exist
        if (result.rows.length !== ids.length) {
            throw new SystemError(`Delete operation affected ${result.rows.length} records, expected ${ids.length}`);
        }

        // Update each SchemaRecord with final database state
        for (const row of result.rows) {
            const dbResult = SqlUtils.convertPostgreSQLTypes(row, schema);
            const record = dataMap.get(dbResult.id);
            if (record) {
                record.setCurrent(dbResult);
            }
        }

        // No need to set context.result - context.data now contains updated SchemaRecord instances
    }
}
