/**
 * Existence Validator Observer
 *
 * Validates that all requested records exist before performing update, delete, or revert operations.
 * Uses SchemaRecord.isNew() to check if original data was loaded by RecordPreloader.
 *
 * Ensures data integrity by preventing operations on non-existent records, providing clear
 * error messages about which records are missing.
 *
 * Ring: 2 (Security) - Schema: all - Operations: update, delete, revert
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { BusinessLogicError } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import type { SchemaRecord } from '@src/lib/schema-record.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class ExistenceValidator extends BaseObserver {
    readonly ring = ObserverRing.Security;
    readonly operations = ['update', 'delete', 'revert'] as const;

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { operation } = context;
        const schemaName = context.schema.schema_name;
        const recordId = record.get('id');

        // Check if record exists in database (RecordPreloader loads original data)
        if (record.isNew()) {
            console.warn(`${operation} operation failed - record not found`, {
                schemaName,
                operation,
                recordId
            });

            throw new BusinessLogicError(
                `Cannot ${operation} - record not found: ${recordId}`,
                undefined,
                'RECORD_NOT_FOUND'
            );
        }

        // Special handling for revert operations - check that record is actually trashed
        if (operation === 'revert') {
            const trashedAt = record.old('trashed_at');

            if (trashedAt === null || trashedAt === undefined) {
                console.warn('Revert operation failed - record is not trashed', {
                    schemaName,
                    recordId,
                    trashedAt
                });

                throw new BusinessLogicError(
                    `Cannot revert non-trashed record: ${recordId}. Only trashed records can be reverted.`,
                    undefined,
                    'CANNOT_REVERT_NON_TRASHED'
                );
            }
        }
    }
}
