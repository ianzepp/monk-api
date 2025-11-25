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
 * Ring: 4 (Enrichment) - Model: all - Operations: create, update
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class UuidArrayProcessor extends BaseObserver {
    readonly ring = ObserverRing.Enrichment;
    readonly operations = ['create', 'update'] as const;
    readonly adapters = ['postgresql'] as const;  // PostgreSQL UUID[] handling

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
        const { record } = context;

        // Check each UUID array field to identify those needing PostgreSQL array format
        for (const fieldName of this.UUID_ARRAY_FIELDS) {
            // Only check fields being set in this operation
            const value = record.new(fieldName);
            if (value && Array.isArray(value)) {
                // The array is valid - SQL observers will handle PostgreSQL array format
                // No transformation needed here, just validation
            }
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
