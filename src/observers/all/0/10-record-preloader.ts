/**
 * Record Preloader Observer
 *
 * Efficiently preloads existing records for operations that need them (update, delete, revert).
 * Performs single database query to fetch all needed records and injects them into SchemaRecord
 * instances via load() method, enabling change tracking and diff computation.
 *
 * NEW DESIGN: Uses SchemaRecord.load() to inject existing data directly into record instances
 * rather than storing in metadata. Each SchemaRecord now holds both current and original data.
 *
 * Ring: 0 (DataPreparation) - Schema: all - Operations: update, delete, revert
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class RecordPreloader extends BaseObserver {
    readonly ring = ObserverRing.DataPreparation;
    readonly operations = ['update', 'delete', 'revert'] as const;
    readonly priority = 10;  // High priority - must run before other observers that need existing records

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, data } = context;
        const schemaName = context.schema.schema_name;

        if (!data || data.length === 0) {
            console.info('No records to preload', { schemaName, operation });
            return;
        }

        // Extract record IDs from SchemaRecord instances
        const recordIds = data
            .map(record => record.get('id'))
            .filter(id => id && typeof id === 'string' && id.trim().length > 0);

        if (recordIds.length === 0) {
            console.info('No record IDs found for preloading', { schemaName, operation });
            return;
        }

        console.info(`Preloading ${recordIds.length} existing records for ${operation}`, {
            schemaName,
            operation,
            recordIds: recordIds.slice(0, 5), // First 5 for logging
            totalIds: recordIds.length
        });

        try {
            // Single database query to fetch all needed existing records
            const existingRecords = await system.database.selectAny(schemaName, {
                where: { id: { $in: recordIds } },
                options: {
                    trashed: true,   // Include trashed for validation
                    deleted: true    // Include deleted for revert operations
                }
            });

            // Build lookup map for efficient matching
            const existingById = existingRecords.reduce((acc, record) => {
                acc[record.id] = record;
                return acc;
            }, {} as Record<string, any>);

            // Inject existing data into SchemaRecord instances
            for (const record of data) {
                const id = record.get('id');
                if (id && existingById[id]) {
                    record.load(existingById[id]);  // Inject original data into SchemaRecord
                }
            }

            console.info(`Successfully preloaded ${existingRecords.length} existing records`, {
                schemaName,
                operation,
                requestedCount: recordIds.length,
                foundCount: existingRecords.length,
                injectedIntoRecords: true
            });

        } catch (error) {
            console.warn('Failed to preload existing records', {
                schemaName,
                operation,
                recordIds: recordIds.slice(0, 3), // First 3 for debugging
                error: error instanceof Error ? error.message : String(error)
            });

            // Records will remain with null original data (isNew() will return true)
            // This is handled gracefully by SchemaRecord methods
        }
    }

    /**
     * DEPRECATED: Helper method for backward compatibility
     * Use SchemaRecord.getOriginal() instead
     */
    static getPreloadedRecords(context: ObserverContext): readonly any[] {
        console.warn('RecordPreloader.getPreloadedRecords() is deprecated. Use SchemaRecord.getOriginal() instead.');
        return context.data?.map(record => {
            const original: Record<string, any> = {};
            // Build object from SchemaRecord's original data
            const changes = record.getChanges();
            for (const field in changes) {
                original[field] = changes[field].old;
            }
            return Object.freeze(original);
        }) || [];
    }

    /**
     * DEPRECATED: Helper method for backward compatibility
     * Use SchemaRecord.getOriginal() instead
     */
    static getPreloadedRecordsById(context: ObserverContext): Readonly<Record<string, any>> {
        console.warn('RecordPreloader.getPreloadedRecordsById() is deprecated. Use SchemaRecord.getOriginal() instead.');
        const recordsById: Record<string, any> = {};
        context.data?.forEach(record => {
            const id = record.get('id');
            if (id) {
                const original: Record<string, any> = {};
                const changes = record.getChanges();
                for (const field in changes) {
                    original[field] = changes[field].old;
                }
                recordsById[id] = Object.freeze(original);
            }
        });
        return Object.freeze(recordsById);
    }
}
