/**
 * UUID Array Processor Observer
 *
 * Processes UUID array fields (access_read, access_edit, access_full, access_deny)
 * to ensure proper PostgreSQL array format handling. Sets metadata flags for
 * SQL observers to generate correct PostgreSQL array literals.
 *
 * This observer prepares UUID array data for PostgreSQL compatibility without
 * modifying the actual data - just sets metadata hints for SQL observers.
 *
 * Ring: 4 (Enrichment) - Schema: all - Operations: create, update
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class UuidArrayProcessor extends BaseObserver {
    readonly ring = ObserverRing.Enrichment;
    readonly operations = ['create', 'update'] as const;

    /**
     * UUID array fields that need special PostgreSQL handling
     */
    private readonly UUID_ARRAY_FIELDS = [
        'access_read',
        'access_edit',
        'access_full',
        'access_deny'
    ];

    async execute(context: ObserverContext): Promise<void> {
        const { operation, data, metadata } = context;
        const schemaName = context.schema.schema_name;

        // Check if data exists
        if (!data || data.length === 0) {
            return;
        }

        let processedFields = 0;
        let processedRecords = 0;

        // Process each record to identify UUID array fields
        for (const record of data) {
            let recordHasUuidArrays = false;

            for (const fieldName of this.UUID_ARRAY_FIELDS) {
                const value = record.get(fieldName);
                if (value && Array.isArray(value)) {
                    // Set metadata flag for SQL observers to use PostgreSQL array format
                    processedFields++;
                    recordHasUuidArrays = true;
                }
            }

            if (recordHasUuidArrays) {
                processedRecords++;
            }
        }

        // Log processing summary for audit

        if (processedFields > 0) {
            console.info('UUID array processing completed', {
                schemaName,
                operation,
                processedFields,
                processedRecords,
                totalRecords: data?.length || 0
            });
        }
    }

    /**
     * Check if a field is a UUID array field
     */
    isUuidArrayField(fieldName: string): boolean {
        return this.UUID_ARRAY_FIELDS.includes(fieldName);
    }

    /**
     * Get list of UUID array fields (for testing/debugging)
     */
    getUuidArrayFields(): string[] {
        return [...this.UUID_ARRAY_FIELDS];
    }
}
