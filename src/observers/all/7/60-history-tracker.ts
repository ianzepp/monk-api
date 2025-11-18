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
        const { system, operation, schema, result, existing, data } = context;
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

        // Process each record
        const records = Array.isArray(data) ? data : [data];
        const results = Array.isArray(result) ? result : (result ? [result] : []);
        const existingRecords = Array.isArray(existing) ? existing : (existing ? [existing] : []);

        for (let i = 0; i < Math.max(records.length, results.length, existingRecords.length); i++) {
            const record = records[i];
            const recordResult = results[i];
            const recordExisting = existingRecords[i];

            await this.createHistoryRecord(
                system,
                operation,
                schemaName,
                trackedColumns,
                record,
                recordResult,
                recordExisting
            );
        }
    }

    /**
     * Create a history record for a single data change
     */
    private async createHistoryRecord(
        system: any,
        operation: string,
        schemaName: string,
        trackedColumns: string[],
        record: any,
        result: any,
        existing: any
    ): Promise<void> {
        // Determine record ID
        const recordId = result?.id || existing?.id || record?.id;
        if (!recordId) {
            logger.warn('History tracker: Cannot track change without record ID', { schemaName, operation });
            return;
        }

        // Compute changes for tracked columns only
        const changes = this.computeTrackedChanges(
            operation,
            trackedColumns,
            existing,
            result,
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
            logger.info('Creating history record', {
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

            logger.info('History record created successfully', {
                schemaName,
                recordId,
                operation,
                trackedFieldCount: Object.keys(changes).length
            });
        } catch (error) {
            logger.error('Failed to create history record', {
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
     * Returns object with structure: { fieldName: { old: value, new: value } }
     */
    private computeTrackedChanges(
        operation: string,
        trackedColumns: string[],
        existing: any,
        result: any,
        record: any
    ): any {
        const changes: any = {};

        switch (operation) {
            case 'create':
                // For creates, store new values for tracked columns
                const createData = result || record || {};
                for (const fieldName of trackedColumns) {
                    if (fieldName in createData) {
                        changes[fieldName] = {
                            old: null,
                            new: createData[fieldName]
                        };
                    }
                }
                break;

            case 'update':
                // For updates, store old and new values for changed tracked columns
                if (!existing) {
                    logger.warn('History tracker: Cannot compute update changes without existing record', { operation });
                    break;
                }

                const updateData = result || record || {};
                for (const fieldName of trackedColumns) {
                    // Only track if the field is in the update data
                    if (fieldName in updateData) {
                        const oldValue = existing[fieldName];
                        const newValue = updateData[fieldName];

                        // Only record if value actually changed
                        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                            changes[fieldName] = {
                                old: oldValue,
                                new: newValue
                            };
                        }
                    }
                }
                break;

            case 'delete':
                // For deletes, store old values for tracked columns
                const deleteData = existing || record || {};
                for (const fieldName of trackedColumns) {
                    if (fieldName in deleteData) {
                        changes[fieldName] = {
                            old: deleteData[fieldName],
                            new: null
                        };
                    }
                }
                break;
        }

        return changes;
    }
}
