/**
 * SQL Delete Observer (SQLite) - Ring 5 Database Transport Layer
 *
 * Handles DELETE operations for SQLite - soft delete (set trashed_at).
 * Uses UPDATE then SELECT to get the deleted record.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';

export default class SqlDeleteSqliteObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['delete'] as const;
    readonly adapters = ['sqlite'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, model, record } = context;

        const id = record.get('id');
        if (!id) {
            throw new SystemError('Delete record must have id field');
        }

        const timestamp = new Date().toISOString();

        // Soft delete: set trashed_at and updated_at
        const updateQuery = `UPDATE "${model.model_name}" SET trashed_at = $1, updated_at = $2 WHERE "id" = $3`;
        const result = await system.adapter!.query(updateQuery, [timestamp, timestamp, id]);

        if (result.rowCount === 0) {
            throw new SystemError(`Delete operation failed - record not found: ${id}`);
        }

        // SELECT the deleted record to get all fields
        const selectQuery = `SELECT * FROM "${model.model_name}" WHERE id = $1`;
        const selectResult = await system.adapter!.query(selectQuery, [id]);

        if (selectResult.rows.length === 0) {
            throw new SystemError(`Failed to retrieve deleted record: ${id}`);
        }

        // Update the ModelRecord with final database state
        const dbResult = this.convertFromSqlite(selectResult.rows[0]);
        record.setCurrent(dbResult);
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
