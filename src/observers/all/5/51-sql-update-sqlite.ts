/**
 * SQL Update Observer (SQLite) - Ring 5 Database Transport Layer
 *
 * Handles UPDATE operations for SQLite - UPDATE without RETURNING.
 * Uses UPDATE then SELECT to get the updated record.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';

export default class SqlUpdateSqliteObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['update'] as const;
    readonly adapters = ['sqlite'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, model, record } = context;

        // Convert ModelRecord to plain object for SQL operations
        const plainRecord = record.toObject();

        if (!plainRecord.id) {
            throw new SystemError('Update record must have id field');
        }

        const { id, ...updateFields } = plainRecord;

        // Process for SQLite compatibility
        const processedFields = this.processForSqlite(updateFields);

        const fields = Object.keys(processedFields);
        const values = Object.values(processedFields);

        if (fields.length === 0) {
            // No fields to update - skip
            return;
        }

        const setClause = fields.map((field, i) => `"${field}" = $${i + 1}`).join(', ');
        const whereParamIndex = fields.length + 1;

        const updateQuery = `UPDATE "${model.model_name}" SET ${setClause} WHERE "id" = $${whereParamIndex}`;
        const allParams = [...values, id];

        const result = await system.adapter!.query(updateQuery, allParams);

        if (result.rowCount === 0) {
            throw new SystemError(`Update failed - record not found: ${id}`);
        }

        // SELECT the updated record to get all fields
        const selectQuery = `SELECT * FROM "${model.model_name}" WHERE id = $1`;
        const selectResult = await system.adapter!.query(selectQuery, [id]);

        if (selectResult.rows.length === 0) {
            throw new SystemError(`Failed to retrieve updated record: ${id}`);
        }

        // Update the ModelRecord with final database state
        const dbResult = this.convertFromSqlite(selectResult.rows[0]);
        record.setCurrent(dbResult);
    }

    /**
     * Process record for SQLite storage
     */
    private processForSqlite(record: any): any {
        const processed = { ...record };

        for (const [key, value] of Object.entries(processed)) {
            if (Array.isArray(value)) {
                processed[key] = JSON.stringify(value);
            } else if (typeof value === 'boolean') {
                processed[key] = value ? 1 : 0;
            } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
                processed[key] = JSON.stringify(value);
            }
        }

        return processed;
    }

    /**
     * Convert SQLite result back to JavaScript types
     */
    private convertFromSqlite(record: any): any {
        const converted = { ...record };
        const arrayFields = ['access_read', 'access_edit', 'access_full', 'access_deny'];

        for (const [key, value] of Object.entries(converted)) {
            if (typeof value === 'string') {
                if (arrayFields.includes(key)) {
                    try {
                        converted[key] = JSON.parse(value);
                    } catch {
                        // Keep as string
                    }
                } else if ((value.startsWith('[') && value.endsWith(']')) ||
                           (value.startsWith('{') && value.endsWith('}'))) {
                    try {
                        converted[key] = JSON.parse(value);
                    } catch {
                        // Keep as string
                    }
                }
            }
        }

        return converted;
    }
}
