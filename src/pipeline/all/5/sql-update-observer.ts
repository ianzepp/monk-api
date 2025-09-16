/**
 * SQL Update Pipeline - Ring 5 Database Transport Layer
 *
 * Handles UPDATE operations - direct SQL execution for updating existing records.
 * Operates on pre-merged data from UpdateMerger observer (Ring 0).
 */

import type { PipelineContext } from '@src/lib/pipeline/interfaces.js';
import { BaseObserver } from '@src/lib/pipeline/base-observer.js';
import { PipelineRing } from '@src/lib/pipeline/types.js';
import { SystemError } from '@src/lib/pipeline/errors.js';
import { SqlUtils } from '@src/lib/pipeline/sql-utils.js';
import { FilterWhere } from '@src/lib/filter-where.js';

export default class SqlUpdatePipeline extends BaseObserver {
    readonly ring = PipelineRing.Database;
    readonly operations = ['update'] as const;

    async execute(context: PipelineContext): Promise<void> {
        const { system, schema, data, metadata } = context;

        if (!data || data.length === 0) {
            context.result = [];
            return;
        }

        const results = [];

        for (const record of data) {
            if (!record.id) {
                throw new SystemError('Update record must have id field');
            }

            const { id, ...updateFields } = record;

            // Process UUID arrays if flagged by UuidArrayProcessor
            let processedFields = SqlUtils.processUuidArrays(updateFields, metadata);

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

            const query = `UPDATE "${schema.table}" SET ${setClause} WHERE ${whereClause} RETURNING *`;
            const allParams = [...values, ...whereParams];

            const result = await SqlUtils.getPool(system).query(query, allParams);
            if (result.rows.length === 0) {
                throw new SystemError(`Update failed - record not found: ${id}`);
            }

            const convertedResult = SqlUtils.convertPostgreSQLTypes(result.rows[0], schema);
            results.push(convertedResult);
        }

        context.result = results;
    }
}
