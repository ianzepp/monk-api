/**
 * Record Preloader Observer
 *
 * Efficiently preloads existing records for operations that need them (update, delete, revert).
 * Performs single database query to fetch all needed records and injects them into ModelRecord
 * instances via load() method, enabling change tracking and diff computation.
 *
 * NEW DESIGN: Uses ModelRecord.load() to inject existing data directly into record instances
 * rather than storing in metadata. Each ModelRecord now holds both current and original data.
 *
 * Ring: 0 (DataPreparation) - Model: all - Operations: update, delete, revert
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ModelRecord } from '@src/lib/model-record.js';

export default class RecordPreloader extends BaseObserver {
    readonly ring = ObserverRing.DataPreparation;
    readonly operations = ['update', 'delete', 'revert'] as const;
    readonly priority = 10;  // High priority - must run before other observers that need existing records

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, data } = context;
        const modelName = context.model.model_name;

        if (!data || data.length === 0) {
            console.info('No records to preload', { modelName, operation });
            return;
        }

        // Extract record IDs from ModelRecord instances
        const recordIds = data
            .map(record => record.get('id'))
            .filter(id => id && typeof id === 'string' && id.trim().length > 0);

        if (recordIds.length === 0) {
            console.info('No record IDs found for preloading', { modelName, operation });
            return;
        }

        console.info(`Preloading ${recordIds.length} existing records for ${operation}`, {
            modelName,
            operation,
            recordIds: recordIds.slice(0, 5), // First 5 for logging
            totalIds: recordIds.length
        });

        try {
            // Single database query to fetch all needed existing records
            const existingRecords = await system.database.selectAny(modelName, {
                where: { id: { $in: recordIds } },
                options: {
                    trashed: true,   // Include trashed for validation
                    deleted: true    // Include deleted for revert operations
                }
            });

            // Build lookup map for efficient matching
            const existingById = existingRecords.reduce((acc: Record<string, any>, record: any) => {
                acc[record.id] = record;
                return acc;
            }, {} as Record<string, any>);

            // Inject existing data into ModelRecord instances
            for (const record of data) {
                const id = record.get('id');
                if (id && existingById[id]) {
                    record.load(existingById[id]);  // Inject original data into ModelRecord
                }
            }

            console.info(`Successfully preloaded ${existingRecords.length} existing records`, {
                modelName,
                operation,
                requestedCount: recordIds.length,
                foundCount: existingRecords.length,
                injectedIntoRecords: true
            });

        } catch (error) {
            console.warn('Failed to preload existing records', {
                modelName,
                operation,
                recordIds: recordIds.slice(0, 3), // First 3 for debugging
                error: error instanceof Error ? error.message : String(error)
            });

            // Records will remain with null original data (isNew() will return true)
            // This is handled gracefully by ModelRecord methods
        }
    }
}
