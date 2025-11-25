/**
 * SQL Create Observer (SQLite) - Ring 5 Database Transport Layer
 *
 * Handles CREATE operations for SQLite - INSERT without RETURNING.
 * Uses INSERT then SELECT to get the created record.
 *
 * SQLite differences from PostgreSQL:
 * - No RETURNING clause (use INSERT + SELECT)
 * - UUID arrays stored as JSON strings (not PostgreSQL array literals)
 * - Booleans stored as INTEGER (0/1)
 * - Timestamps stored as TEXT (ISO 8601)
 */

import crypto from 'crypto';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';

export default class SqlCreateSqliteObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['create'] as const;
    readonly adapters = ['sqlite'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, model, record } = context;

        const timestamp = new Date().toISOString();

        // Convert ModelRecord to plain object for SQL operations
        const plainRecord = record.toObject();

        // Set up record with required system fields
        const recordWithDefaults = {
            id: plainRecord.id || crypto.randomUUID(),
            created_at: plainRecord.created_at || timestamp,
            updated_at: plainRecord.updated_at || timestamp,
            ...plainRecord,
        };

        // Process for SQLite compatibility
        const processedRecord = this.processForSqlite(recordWithDefaults);

        // Build parameterized INSERT query (no RETURNING)
        const fields = Object.keys(processedRecord);
        const values = Object.values(processedRecord);
        const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
        const fieldList = fields.map(field => `"${field}"`).join(', ');

        const insertQuery = `INSERT INTO "${model.model_name}" (${fieldList}) VALUES (${placeholders})`;

        try {
            await system.adapter!.query(insertQuery, values);
        } catch (error) {
            throw new SystemError(
                `Failed to insert record into ${model.model_name}: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        // SELECT the inserted record to get all fields (including defaults)
        const selectQuery = `SELECT * FROM "${model.model_name}" WHERE id = $1`;
        const result = await system.adapter!.query(selectQuery, [recordWithDefaults.id]);

        if (result.rows.length === 0) {
            throw new SystemError(`Failed to retrieve created record in ${model.model_name}`);
        }

        // Update the ModelRecord with final database state
        const dbResult = this.convertFromSqlite(result.rows[0]);
        record.setCurrent(dbResult);
    }

    /**
     * Process record for SQLite storage
     * - Convert arrays to JSON strings
     * - Convert booleans to 0/1
     * - Convert objects to JSON strings
     */
    private processForSqlite(record: any): any {
        const processed = { ...record };

        for (const [key, value] of Object.entries(processed)) {
            if (Array.isArray(value)) {
                // Store arrays as JSON strings
                processed[key] = JSON.stringify(value);
            } else if (typeof value === 'boolean') {
                // SQLite uses 0/1 for booleans
                processed[key] = value ? 1 : 0;
            } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
                // Store objects as JSON strings
                processed[key] = JSON.stringify(value);
            }
        }

        return processed;
    }

    /**
     * Convert SQLite result back to JavaScript types
     * - Parse JSON strings back to arrays/objects
     * - Convert 0/1 back to booleans (based on field name conventions)
     */
    private convertFromSqlite(record: any): any {
        const converted = { ...record };

        // Known array fields
        const arrayFields = ['access_read', 'access_edit', 'access_full', 'access_deny'];

        for (const [key, value] of Object.entries(converted)) {
            if (typeof value === 'string') {
                // Try to parse JSON for known array fields
                if (arrayFields.includes(key)) {
                    try {
                        converted[key] = JSON.parse(value);
                    } catch {
                        // Keep as string if not valid JSON
                    }
                }
                // Check if it looks like a JSON object/array
                else if ((value.startsWith('[') && value.endsWith(']')) ||
                         (value.startsWith('{') && value.endsWith('}'))) {
                    try {
                        converted[key] = JSON.parse(value);
                    } catch {
                        // Keep as string if not valid JSON
                    }
                }
            }
        }

        return converted;
    }
}
