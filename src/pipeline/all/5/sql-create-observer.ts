/**
 * SQL Create Pipeline - Ring 5 Database Transport Layer
 *
 * Handles CREATE operations - direct SQL execution for inserting new records.
 * Operates on pre-validated, pre-processed data from earlier observer rings.
 */

import type { PipelineContext } from '@src/lib/pipeline/interfaces.js';
import { BaseObserver } from '@src/lib/pipeline/base-observer.js';
import { PipelineRing } from '@src/lib/pipeline/types.js';
import { SystemError } from '@src/lib/pipeline/errors.js';
import { SqlUtils } from '@src/lib/pipeline/sql-utils.js';

export default class SqlCreatePipeline extends BaseObserver {
    readonly ring = PipelineRing.Database;
    readonly operations = ['create'] as const;

    async execute(context: PipelineContext): Promise<void> {
        const { system, schema, data, metadata } = context;

        if (!data || data.length === 0) {
            context.result = [];
            return;
        }

        const results = [];
        const timestamp = new Date().toISOString();

        for (const recordData of data) {
            // Set up record with required system fields
            const record = {
                id: recordData.id || SqlUtils.generateId(),
                created_at: recordData.created_at || timestamp,
                updated_at: recordData.updated_at || timestamp,
                ...recordData,
            };

            // Process UUID arrays if flagged by UuidArrayProcessor
            let processedRecord = SqlUtils.processUuidArrays(record, metadata);

            // Process JSONB fields (objects/arrays) for PostgreSQL serialization
            processedRecord = SqlUtils.processJsonbFields(processedRecord, schema);

            // Build parameterized INSERT query
            const fields = Object.keys(processedRecord);
            const values = Object.values(processedRecord);
            const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
            const fieldList = fields.map(field => `"${field}"`).join(', ');

            const query = `INSERT INTO "${schema.table}" (${fieldList}) VALUES (${placeholders}) RETURNING *`;
            const result = await SqlUtils.getPool(system).query(query, values);

            if (result.rows.length === 0) {
                throw new SystemError(`Failed to create record in ${schema.name}`);
            }

            const convertedResult = SqlUtils.convertPostgreSQLTypes(result.rows[0], schema);
            results.push(convertedResult);
        }

        context.result = results;
    }
}
