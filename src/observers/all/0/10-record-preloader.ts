/**
 * Record Preloader Observer
 *
 * Efficiently preloads existing records for operations that need them (update, delete, revert).
 * Performs single database query to fetch all needed records and stores them as read-only
 * metadata for other observers to consume, preventing duplicate queries.
 *
 * Multiple observers need existing records (soft delete protection, existence validation,
 * update merging). Rather than each observer re-selecting data, this observer loads
 * everything once and provides it as frozen objects for data safety.
 *
 * Ring: 0 (Validation) - Schema: all - Operations: update, delete, revert
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class RecordPreloader extends BaseObserver {
    readonly ring = ObserverRing.DataPreparation;
    readonly operations = ['update', 'delete', 'revert'] as const;
    readonly priority = 10;  // High priority - must run before other observers that need existing records

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, data, metadata } = context;
        const schemaName = context.schema.schema_name;

        // Extract record IDs that need existing data lookup
        const recordIds = this.extractRecordIds(data, operation);

        if (recordIds.length === 0) {
            logger.info('No record IDs found for preloading', { schemaName, operation });
            return;
        }

        logger.info(`Preloading ${recordIds.length} existing records for ${operation}`, {
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

            // Store as READ-ONLY data in context metadata for other observers
            const frozenRecords = Object.freeze(existingRecords.map(record => Object.freeze(record)));
            const frozenById = Object.freeze(
                existingRecords.reduce((acc, record) => {
                    acc[record.id] = Object.freeze(record);
                    return acc;
                }, {} as Record<string, any>)
            );

            // Store as frozen data for other observers (data sharing pattern)
            metadata.set('existing_records', frozenRecords);
            metadata.set('existing_records_by_id', frozenById);

            logger.info(`Successfully preloaded ${existingRecords.length} existing records`, {
                schemaName,
                operation,
                requestedCount: recordIds.length,
                foundCount: existingRecords.length,
                frozenRecords: true
            });

        } catch (error) {
            logger.warn('Failed to preload existing records', {
                schemaName,
                operation,
                recordIds: recordIds.slice(0, 3), // First 3 for debugging
                error: error instanceof Error ? error.message : String(error)
            });

            // Set empty metadata so other observers can safely access it
            metadata.set('existing_records', Object.freeze([]));
            metadata.set('existing_records_by_id', Object.freeze({}));
        }
    }

    /**
     * Extract record IDs from data based on operation type
     */
    private extractRecordIds(data: any[], operation: string): string[] {
        const ids: string[] = [];

        for (const record of data) {
            switch (operation) {
                case 'update':
                case 'delete':
                    // For update/delete, ID should be in record.id
                    if (record.id) {
                        ids.push(record.id);
                    }
                    break;

                case 'revert':
                    // For revert, data might be IDs directly or objects with ID
                    if (typeof record === 'string') {
                        ids.push(record);
                    } else if (record.id) {
                        ids.push(record.id);
                    }
                    break;
            }
        }

        // Remove duplicates and filter out empty values
        return Array.from(new Set(ids)).filter(id => id && id.trim().length > 0);
    }

    /**
     * Helper method for other observers to get preloaded records
     *
     * This method can be called statically by other observers to safely
     * access preloaded record data with proper error handling.
     */
    static getPreloadedRecords(context: ObserverContext): readonly any[] {
        const records = context.metadata.get('existing_records');
        return records || [];
    }

    /**
     * Helper method for other observers to get preloaded records by ID
     */
    static getPreloadedRecordsById(context: ObserverContext): Readonly<Record<string, any>> {
        const recordsById = context.metadata.get('existing_records_by_id');
        return recordsById || {};
    }
}
