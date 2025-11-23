/**
 * History Tracker Observer
 *
 * Tracks changes to records with tracked fields, storing field-level deltas
 * in the history table for audit trail and change tracking purposes.
 *
 * Ring: 7 (Audit) - Model: all - Operations: create, update, delete
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class HistoryTracker extends BaseObserver {
    readonly ring = ObserverRing.Audit;
    readonly operations = ['create', 'update', 'delete'] as const;
    readonly priority = 60;

    // System models to skip (to avoid infinite loops and reduce noise)
    private readonly SYSTEM_MODELS = ['models', 'fields', 'users', 'history'];

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, model, data } = context;
        const modelName = model.model_name;

        // Skip system models
        if (this.SYSTEM_MODELS.includes(modelName)) {
            return;
        }

        // Skip if no tracked fields
        if (model.trackedFields.size === 0) {
            return;
        }

        const trackedFields = Array.from(model.trackedFields);

        // Process each ModelRecord (contains both original and current state)
        const records = Array.isArray(data) ? data : [data];

        for (const record of records) {
            await this.createHistoryRecord(
                system,
                operation,
                modelName,
                trackedFields,
                record
            );
        }
    }

    /**
     * Create a history record for a single data change
     * @param record ModelRecord with _original (before) and _current (after) state
     */
    private async createHistoryRecord(
        system: any,
        operation: string,
        modelName: string,
        trackedFields: string[],
        record: any
    ): Promise<void> {
        // Determine record ID from current state
        const recordId = record.get('id');
        if (!recordId) {
            console.warn('History tracker: Cannot track change without record ID', { modelName, operation });
            return;
        }

        // Compute changes for tracked fields only
        // ModelRecord has getOriginal() and get() for before/after comparison
        const changes = this.computeTrackedChanges(
            operation,
            trackedFields,
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
                modelName,
                recordId,
                operation,
                changes,
                userId,
                trackedFieldCount: Object.keys(changes).length
            });

            await system.db.query(
                `
                INSERT INTO history (
                    model_name,
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
                    modelName,
                    recordId,
                    operation,
                    JSON.stringify(changes),
                    userId,
                    system.correlationId || null,
                    Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
                ]
            );

            console.info('History record created successfully', {
                modelName,
                recordId,
                operation,
                trackedFieldCount: Object.keys(changes).length
            });
        } catch (error) {
            console.error('Failed to create history record', {
                modelName,
                recordId,
                operation,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            // Don't throw - history tracking should not break the main operation
        }
    }

    /**
     * Compute field-level changes for tracked fields only
     * Uses ModelRecord's getOriginal() and get() for before/after comparison
     * Returns object with structure: { fieldName: { old: value, new: value } }
     */
    private computeTrackedChanges(
        operation: string,
        trackedFields: string[],
        record: any
    ): any {
        const changes: any = {};

        switch (operation) {
            case 'create':
                // For creates, store new values for tracked fields (no original values)
                for (const fieldName of trackedFields) {
                    if (record.has(fieldName)) {
                        changes[fieldName] = {
                            old: null,
                            new: record.get(fieldName)
                        };
                    }
                }
                break;

            case 'update':
                // For updates, store old and new values for changed tracked fields
                for (const fieldName of trackedFields) {
                    // Use ModelRecord's changed() method to detect changes
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
                for (const fieldName of trackedFields) {
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
