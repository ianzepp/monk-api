/**
 * History Tracker Observer
 *
 * Tracks changes to records with tracked columns, storing field-level deltas
 * in the history table for audit trail and change tracking purposes.
 *
 * Ring: 7 (Audit) - Schema: all - Operations: create, update, delete
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class HistoryTracker extends BaseObserver {
    readonly ring = ObserverRing.Audit;
    readonly operations = ['create', 'update', 'delete'] as const;
    readonly priority = 60;

    // System schemas to skip (to avoid infinite loops and reduce noise)
    private readonly SYSTEM_SCHEMAS = ['schemas', 'columns', 'users', 'history'];

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, schema, data } = context;
        const schemaName = schema.schema_name;

        // Skip system schemas
        if (this.SYSTEM_SCHEMAS.includes(schemaName)) {
            return;
        }

        // Skip if no tracked columns
        if (schema.trackedFields.size === 0) {
            return;
        }

        const trackedColumns = Array.from(schema.trackedFields);

        // Process each SchemaRecord (contains both original and current state)
        const records = Array.isArray(data) ? data : [data];

        for (const record of records) {
            await this.createHistoryRecord(
                system,
                operation,
                schemaName,
                trackedColumns,
                record
            );
        }
    }

    /**
     * Create a history record for a single data change
     * @param record SchemaRecord with _original (before) and _current (after) state
     */
    private async createHistoryRecord(
        system: any,
        operation: string,
        schemaName: string,
        trackedColumns: string[],
        record: any
    ): Promise<void> {
        // Determine record ID from current state
        const recordId = record.get('id');
        if (!recordId) {
            console.warn('History tracker: Cannot track change without record ID', { schemaName, operation });
            return;
        }

        // Compute changes for tracked columns only
        // SchemaRecord has getOriginal() and get() for before/after comparison
        const changes = this.computeTrackedChanges(
            operation,
            trackedColumns,
            record
        );

        // Skip if no tracked fields changed (for updates)
        if (operation === 'update' && Object.keys(changes).length === 0) {
            return;
        }

        // Get user context
        const user = system.getUser?.();
        const userId = user?.id || null;

        // Extract metadata
        const metadata: any = {};
        if (system.context) {
            const jwtPayload = system.context.get('jwtPayload');
            if (jwtPayload) {
                metadata.user_role = jwtPayload.role;
                metadata.user_tenant = jwtPayload.tenant;
            }
        }

        // Create history record using raw SQL to avoid observer recursion
        try {
            console.info('Creating history record', {
                schemaName,
                recordId,
                operation,
                changes,
                userId,
                trackedFieldCount: Object.keys(changes).length
            });

            await system.db.query(
                `
                INSERT INTO history (
                    schema_name,
                    record_id,
                    operation,
                    changes,
                    created_by,
                    request_id,
                    metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                `,
                [
                    schemaName,
                    recordId,
                    operation,
                    JSON.stringify(changes),
                    userId,
                    system.correlationId || null,
                    Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
                ]
            );

            console.info('History record created successfully', {
                schemaName,
                recordId,
                operation,
                trackedFieldCount: Object.keys(changes).length
            });
        } catch (error) {
            console.error('Failed to create history record', {
                schemaName,
                recordId,
                operation,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            // Don't throw - history tracking should not break the main operation
        }
    }

    /**
     * Compute field-level changes for tracked columns only
     * Uses SchemaRecord's getOriginal() and get() for before/after comparison
     * Returns object with structure: { fieldName: { old: value, new: value } }
     */
    private computeTrackedChanges(
        operation: string,
        trackedColumns: string[],
        record: any
    ): any {
        const changes: any = {};

        switch (operation) {
            case 'create':
                // For creates, store new values for tracked columns (no original values)
                for (const fieldName of trackedColumns) {
                    if (record.has(fieldName)) {
                        changes[fieldName] = {
                            old: null,
                            new: record.get(fieldName)
                        };
                    }
                }
                break;

            case 'update':
                // For updates, store old and new values for changed tracked columns
                for (const fieldName of trackedColumns) {
                    // Use SchemaRecord's changed() method to detect changes
                    if (record.changed(fieldName)) {
                        changes[fieldName] = {
                            old: record.getOriginal(fieldName),
                            new: record.get(fieldName)
                        };
                    }
                }
                break;

            case 'delete':
                // For deletes, store original values (new values are the trashed state)
                for (const fieldName of trackedColumns) {
                    if (record.has(fieldName)) {
                        changes[fieldName] = {
                            old: record.getOriginal(fieldName) ?? record.get(fieldName),
                            new: record.get(fieldName)  // Include trashed_at in new state
                        };
                    }
                }
                break;
        }

        return changes;
    }
}
