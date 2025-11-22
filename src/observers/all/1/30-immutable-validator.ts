/**
 * Immutable Fields Validator - Field-Level Write Protection Observer
 *
 * Prevents modifications to fields marked with immutable=true once they have been set.
 * Fields can be set during creation or their first update, but subsequent changes are blocked.
 *
 * Performance:
 * - Zero database queries: uses Schema.getImmutableFields() from cached column metadata
 * - O(n) field check: iterates over changed fields only (not all fields)
 * - Uses RecordPreloader's cached existing records to check current values
 *
 * Use cases:
 * - Audit fields (created_by, created_at) that should never change
 * - Regulatory identifiers (SSN, account numbers) that are write-once
 * - Historical data preservation (original_price, initial_status)
 * - Blockchain-style immutability for critical fields
 *
 * Ring 1 (Input Validation) - Priority 30 (after freeze check, before business logic)
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import RecordPreloader from '@src/observers/all/0/10-record-preloader.js';

export default class ImmutableValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['update'] as const;
    readonly priority = 30;

    async execute(context: ObserverContext): Promise<void> {
        const { schema, data, operation } = context;
        const schemaName = schema.schema_name;

        // Check if data exists
        if (!data || data.length === 0) {
            return;
        }

        // Get immutable fields from cached schema metadata (O(1))
        const immutableFields = schema.getImmutableFields();

        // No immutable fields defined - skip validation
        if (immutableFields.size === 0) {
            return;
        }

        // Get preloaded existing records for comparison (no DB query)
        const existingRecordsById = RecordPreloader.getPreloadedRecordsById(context);

        // If preload failed, we can't validate - let other observers handle
        if (Object.keys(existingRecordsById).length === 0) {
            console.warn('Cannot validate immutable fields - preload failed', {
                schemaName,
                operation
            });
            return;
        }

        // Track violations for detailed error reporting
        const violations: Array<{ recordId: string; field: string; oldValue: any; newValue: any }> = [];

        // Check each record for immutable field violations
        for (const record of data) {
            const recordId = record.get('id'); // Merged view - ID may be in original
            const existingRecord = existingRecordsById[recordId];

            if (!existingRecord) {
                // Record doesn't exist yet - should not happen in update operation
                // but UpdateMerger will handle this case
                continue;
            }

            // Convert to plain object to iterate fields
            const plainRecord = record.toObject();

            // Check each changed field
            for (const fieldName of Object.keys(plainRecord)) {
                // Skip non-immutable fields
                if (!immutableFields.has(fieldName)) {
                    continue;
                }

                const oldValue = existingRecord[fieldName];
                const newValue = record.new(fieldName); // Only check if field is being changed

                // Allow setting immutable field if it was null/undefined (first write)
                if (oldValue === null || oldValue === undefined) {
                    console.info('Allowing first write to immutable field', {
                        schemaName,
                        recordId,
                        field: fieldName,
                        newValue
                    });
                    continue;
                }

                // Check if value is actually changing
                if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                    violations.push({
                        recordId,
                        field: fieldName,
                        oldValue,
                        newValue
                    });
                }
            }
        }

        // If violations found, throw detailed error
        if (violations.length > 0) {
            const violationSummary = violations
                .slice(0, 5) // Show first 5 violations
                .map(v => `${v.field} on record ${v.recordId} (was: ${JSON.stringify(v.oldValue)}, attempted: ${JSON.stringify(v.newValue)})`)
                .join('; ');

            const totalViolations = violations.length;
            const message = totalViolations > 5
                ? `${violationSummary}... and ${totalViolations - 5} more violations`
                : violationSummary;

            console.warn('Blocked update to immutable fields', {
                schemaName,
                operation,
                violations: totalViolations,
                details: violations.slice(0, 5)
            });

            throw new ValidationError(
                `Cannot modify immutable fields: ${message}`,
                violations[0].field // First violated field
            );
        }

        // No violations - allow operation to continue
        console.info('Immutable field validation passed', {
            schemaName,
            operation,
            recordsChecked: data?.length || 0,
            immutableFields: immutableFields.size
        });
    }
}
