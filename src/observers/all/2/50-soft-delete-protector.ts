/**
 * Soft Delete Protector Observer
 *
 * Prevents operations on records that have been soft deleted (trashed_at is not null).
 * Uses preloaded record data from RecordPreloader to check trashed status efficiently
 * without additional database queries.
 *
 * This enforces the three-tier soft delete access pattern:
 * - List operations: Hide trashed records (handled by query filters)
 * - Direct access: Allow ID retrieval of trashed records (GET /api/data/:schema/:id)
 * - Update operations: Block modifications until restoration (this observer)
 *
 * Ring: 2 (Security) - Schema: all - Operations: update, delete
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { SecurityError } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import RecordPreloader from '@src/observers/all/0/10-record-preloader.js';

export default class SoftDeleteProtector extends BaseObserver {
    readonly ring = ObserverRing.Security;
    readonly operations = ['update', 'delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { operation, data, metadata } = context;
        const schemaName = context.schema.schema_name;

        // Use preloaded existing records to check trashed status
        const existingRecords = RecordPreloader.getPreloadedRecords(context);
        const preloadStats = { foundCount: Object.keys(RecordPreloader.getPreloadedRecordsById(context)).length };

        // If preloading failed, we can't validate - let other observers handle
        if (Object.keys(RecordPreloader.getPreloadedRecordsById(context)).length === 0) {
            console.warn('Cannot validate soft delete protection - preload failed', {
                schemaName,
                operation,
            });
            return;
        }

        // Check for trashed records in the preloaded data
        const trashedRecords = existingRecords.filter(record =>
            record.trashed_at !== null && record.trashed_at !== undefined
        );

        if (trashedRecords.length > 0) {
            const trashedIds = trashedRecords.map(record => record.id);

            // Log detailed information about blocked operation
            console.warn(`Blocked ${operation} on trashed records`, {
                schemaName,
                operation,
                trashedRecords: trashedIds.length,
                trashedIds: trashedIds.slice(0, 5), // First 5 for logging
                totalRequested: data.length
            });

            throw new SecurityError(
                `Cannot ${operation} trashed records: ${trashedIds.join(', ')}. ` +
                `Use revert operation to restore records before modification.`,
                undefined, // No specific field
                'SOFT_DELETE_PROTECTION'
            );
        }

        // Also check for hard deleted records (deleted_at is not null)
        const deletedRecords = existingRecords.filter(record =>
            record.deleted_at !== null && record.deleted_at !== undefined
        );

        if (deletedRecords.length > 0) {
            const deletedIds = deletedRecords.map(record => record.id);

            console.warn(`Blocked ${operation} on deleted records`, {
                schemaName,
                operation,
                deletedRecords: deletedIds.length,
                deletedIds: deletedIds.slice(0, 5),
                totalRequested: data.length
            });

            throw new SecurityError(
                `Cannot ${operation} permanently deleted records: ${deletedIds.join(', ')}. ` +
                `These records cannot be modified.`,
                undefined,
                'HARD_DELETE_PROTECTION'
            );
        }

        // Record successful protection check

        console.info('Soft delete protection check passed', {
            schemaName,
            operation,
            checkedRecords: existingRecords.length,
            requestedRecords: data.length,
            trashedRecords: 0,
            deletedRecords: 0
        });
    }

    /**
     * Helper method to check if a specific record is trashed
     */
    static isRecordTrashed(record: any): boolean {
        if (!record) return false;
        return record.trashed_at !== null && record.trashed_at !== undefined;
    }

    /**
     * Helper method to check if a specific record is deleted
     */
    static isRecordDeleted(record: any): boolean {
        if (!record) return false;
        return record.deleted_at !== null && record.deleted_at !== undefined;
    }

    /**
     * Helper method to check if a specific record can be modified
     */
    static canModifyRecord(record: any): boolean {
        if (!record) return false;
        return !this.isRecordTrashed(record) && !this.isRecordDeleted(record);
    }

    /**
     * Helper method to get protection stats from context
     */
    static getProtectionStats(context: ObserverContext): {
        wasChecked: boolean;
        checkedRecords: number;
        trashedRecords: number;
        deletedRecords: number;
        status: string;
    } {
        const metadata = context.metadata;

        return {
            wasChecked: metadata.has('soft_delete_protection'),
            checkedRecords: metadata.get('protected_record_count') || 0,
            trashedRecords: metadata.get('trashed_record_count') || 0,
            deletedRecords: metadata.get('deleted_record_count') || 0,
            status: metadata.get('soft_delete_protection') || 'not_checked'
        };
    }
}
