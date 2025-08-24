/**
 * UUID Array Processor Observer
 * 
 * Processes UUID array fields (access_read, access_edit, access_full, access_deny)
 * to ensure proper PostgreSQL array format handling. Sets metadata flags for
 * SqlObserver to generate correct PostgreSQL array literals.
 * 
 * This observer prepares UUID array data for PostgreSQL compatibility without
 * modifying the actual data - just sets metadata hints for SqlObserver.
 * 
 * Ring: 4 (Enrichment) - Schema: all - Operations: create, update
 */

import { BaseObserver } from '@lib/observers/base-observer.js';
import type { ObserverContext } from '@lib/observers/interfaces.js';
import { ObserverRing } from '@lib/observers/types.js';

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
        const { system, schemaName, operation, data, metadata } = context;
        
        let processedFields = 0;
        let processedRecords = 0;
        
        // Process each record to identify UUID array fields
        for (const record of data) {
            let recordHasUuidArrays = false;
            
            for (const fieldName of this.UUID_ARRAY_FIELDS) {
                if (record[fieldName] && Array.isArray(record[fieldName])) {
                    // Set metadata flag for SqlObserver to use PostgreSQL array format
                    metadata.set(`${fieldName}_is_uuid_array`, true);
                    processedFields++;
                    recordHasUuidArrays = true;
                }
            }
            
            if (recordHasUuidArrays) {
                processedRecords++;
            }
        }
        
        // Log processing summary for audit
        metadata.set('uuid_array_processing', 'completed');
        metadata.set('uuid_fields_processed', processedFields);
        metadata.set('records_with_uuid_arrays', processedRecords);
        
        if (processedFields > 0) {
            system.info('UUID array processing completed', {
                schemaName,
                operation,
                processedFields,
                processedRecords,
                totalRecords: data.length
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