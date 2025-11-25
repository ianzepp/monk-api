/**
 * SQL Revert Observer (SQLite) - Ring 5 Database Transport Layer
 *
 * Handles REVERT operations for SQLite - undo soft delete (clear trashed_at).
 * Uses UPDATE then SELECT to get the reverted record.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';

export default class SqlRevertSqliteObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['revert'] as const;
    readonly adapters = ['sqlite'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, model, record } = context;

        const id = record.get('id');
        if (!id) {
            throw new SystemError('Revert record must have id field');
        }

        const timestamp = new Date().toISOString();

        // Revert: clear trashed_at and update updated_at
        // Only revert actually trashed records
        const updateQuery = `UPDATE "${model.model_name}" SET trashed_at = NULL, updated_at = $1 WHERE "id" = $2 AND "trashed_at" IS NOT NULL`;
        const result = await system.adapter!.query(updateQuery, [timestamp, id]);

        if (result.rowCount === 0) {
            throw new SystemError(`Revert operation failed - record not found or not trashed: ${id}`);
        }

        // SELECT the reverted record to get all fields
        const selectQuery = `SELECT * FROM "${model.model_name}" WHERE id = $1`;
        const selectResult = await system.adapter!.query(selectQuery, [id]);

        if (selectResult.rows.length === 0) {
            throw new SystemError(`Failed to retrieve reverted record: ${id}`);
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
