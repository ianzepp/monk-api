/**
 * SQL Update Observer - Ring 5 Database Transport Layer
 *
 * Handles UPDATE operations - direct SQL execution for updating existing records.
 * Operates on pre-merged data from UpdateMerger observer (Ring 0).
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { FilterWhere } from '@src/lib/filter-where.js';
import { SchemaRecord } from '@src/lib/schema-record.js';

export default class SqlUpdateObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema, data } = context;

        if (!data || data.length === 0) {
            return;
        }

        for (const record of data) {
            // Convert SchemaRecord to plain object for SQL operations
            const plainRecord = record.toObject();

            if (!plainRecord.id) {
                throw new SystemError('Update record must have id field');
            }

            const { id, ...updateFields } = plainRecord;

            // Process UUID arrays for PostgreSQL compatibility
            let processedFields = SqlUtils.processUuidArrays(updateFields);

            // Process JSONB fields (objects/arrays) for PostgreSQL serialization
            processedFields = SqlUtils.processJsonbFields(processedFields, schema);

            const fields = Object.keys(processedFields);
            const values = Object.values(processedFields);

            if (fields.length === 0) {
                // No fields to update after processing - skip this record
                continue;
            }

            const setClause = fields.map((field, i) => `"${field}" = $${i + 1}`).join(', ');

            // Use FilterWhere for consistent WHERE clause generation
            const { whereClause, params: whereParams } = FilterWhere.generate(
                { id }, // WHERE conditions
                fields.length // Start WHERE parameters after SET parameters
            );

            const query = `UPDATE "${schema.schema_name}" SET ${setClause} WHERE ${whereClause} RETURNING *`;
            const allParams = [...values, ...whereParams];

            const result = await SqlUtils.getPool(system).query(query, allParams);
            if (result.rows.length === 0) {
                throw new SystemError(`Update failed - record not found: ${id}`);
            }

            // Update the SchemaRecord with final database state (preserves change tracking)
            const dbResult = SqlUtils.convertPostgreSQLTypes(result.rows[0], schema);
            record.setCurrent(dbResult);
        }

        // No need to set context.result - context.data now contains updated SchemaRecord instances
    }
}
