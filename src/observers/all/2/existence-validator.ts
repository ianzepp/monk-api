/**
 * Existence Validator Observer
 * 
 * Validates that all requested records exist before performing update, delete, or revert operations.
 * Uses preloaded record data from RecordPreloader to efficiently check existence without
 * additional database queries.
 * 
 * Ensures data integrity by preventing operations on non-existent records, providing clear
 * error messages about which records are missing.
 * 
 * Ring: 2 (Security) - Schema: all - Operations: update, delete, revert
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { BusinessLogicError } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import RecordPreloader from '../0/record-preloader.js';

export default class ExistenceValidator extends BaseObserver {
    readonly ring = ObserverRing.Security;
    readonly operations = ['update', 'delete', 'revert'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schemaName, operation, data, metadata } = context;
        
        // Extract the record IDs we're trying to operate on
        const requestedIds = this.extractRecordIds(data, operation);
        
        if (requestedIds.length === 0) {
            logger.info('No record IDs found for existence validation', { schemaName, operation });
            metadata.set('existence_validation', 'skipped_no_ids');
            return;
        }
        
        // Get preloaded records to check existence
        const existingRecords = RecordPreloader.getPreloadedRecords(context);
        const preloadStats = RecordPreloader.getPreloadStats(context);
        
        // If preloading failed, we can't validate existence
        if (RecordPreloader.hasPreloadError(context)) {
            logger.warn('Cannot validate record existence - preload failed', {
                schemaName,
                operation,
                requestedIds: requestedIds.length,
                requestedRecords: preloadStats.requestedCount
            });
            
            throw new BusinessLogicError(
                `Cannot validate record existence for ${operation} operation - database access failed`,
                undefined,
                'EXISTENCE_VALIDATION_FAILED'
            );
        }
        
        // Check existence by comparing requested IDs with found records
        const foundIds = existingRecords.map(record => record.id);
        const missingIds = requestedIds.filter(id => !foundIds.includes(id));
        
        if (missingIds.length > 0) {
            // Some records are missing - this is an error
            logger.warn(`${operation} operation failed - records not found`, {
                schemaName,
                operation,
                requestedCount: requestedIds.length,
                foundCount: foundIds.length,
                missingCount: missingIds.length,
                missingIds: missingIds.slice(0, 5), // First 5 for logging
                foundIds: foundIds.slice(0, 5)      // First 5 for logging
            });
            
            const errorMessage = missingIds.length === 1 
                ? `Record not found: ${missingIds[0]}`
                : `Records not found: ${missingIds.join(', ')}`;
            
            throw new BusinessLogicError(
                `Cannot ${operation} - ${errorMessage}`,
                undefined,
                'RECORD_NOT_FOUND'
            );
        }
        
        // Special handling for revert operations - check that records are actually trashed
        if (operation === 'revert') {
            const nonTrashedRecords = existingRecords.filter(record => 
                record.trashed_at === null || record.trashed_at === undefined
            );
            
            if (nonTrashedRecords.length > 0) {
                const nonTrashedIds = nonTrashedRecords.map(record => record.id);
                
                logger.warn('Revert operation failed - records are not trashed', {
                    schemaName,
                    operation,
                    nonTrashedCount: nonTrashedIds.length,
                    nonTrashedIds: nonTrashedIds.slice(0, 5),
                    totalRequested: requestedIds.length
                });
                
                throw new BusinessLogicError(
                    `Cannot revert non-trashed records: ${nonTrashedIds.join(', ')}. ` +
                    `Only trashed records can be reverted.`,
                    undefined,
                    'CANNOT_REVERT_NON_TRASHED'
                );
            }
        }
        
        // All records exist and are valid for the operation
        metadata.set('existence_validation', 'passed');
        metadata.set('validated_record_count', existingRecords.length);
        metadata.set('requested_record_count', requestedIds.length);
        metadata.set('missing_record_count', 0);
        
        logger.info('Record existence validation passed', {
            schemaName,
            operation,
            requestedCount: requestedIds.length,
            foundCount: existingRecords.length,
            validatedCount: existingRecords.length
        });
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
                    if (record && record.id) {
                        ids.push(record.id);
                    }
                    break;
                    
                case 'revert':
                    // For revert, data might be IDs directly or objects with ID
                    if (typeof record === 'string') {
                        ids.push(record);
                    } else if (record && record.id) {
                        ids.push(record.id);
                    }
                    break;
            }
        }
        
        // Remove duplicates and filter out empty values
        return Array.from(new Set(ids)).filter(id => id && id.trim().length > 0);
    }
    
    /**
     * Helper method to check if a specific ID exists in preloaded records
     */
    static recordExists(context: ObserverContext, recordId: string): boolean {
        const recordsById = RecordPreloader.getPreloadedRecordsById(context);
        return recordId in recordsById;
    }
    
    /**
     * Helper method to get a specific record by ID from preloaded data
     */
    static getExistingRecord(context: ObserverContext, recordId: string): any | null {
        const recordsById = RecordPreloader.getPreloadedRecordsById(context);
        return recordsById[recordId] || null;
    }
    
    /**
     * Helper method to get validation stats from context
     */
    static getValidationStats(context: ObserverContext): {
        wasValidated: boolean;
        requestedCount: number;
        foundCount: number;
        missingCount: number;
        status: string;
    } {
        const metadata = context.metadata;
        
        return {
            wasValidated: metadata.has('existence_validation'),
            requestedCount: metadata.get('requested_record_count') || 0,
            foundCount: metadata.get('validated_record_count') || 0,
            missingCount: metadata.get('missing_record_count') || 0,
            status: metadata.get('existence_validation') || 'not_validated'
        };
    }
}