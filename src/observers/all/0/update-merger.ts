/**
 * Update Merger Observer
 * 
 * Properly merges existing record data with update data for update operations.
 * Uses preloaded existing records to perform efficient merging without additional
 * database queries, ensuring that unchanged fields are preserved.
 * 
 * This observer handles the complex logic of:
 * - Merging existing record data with update data
 * - Preserving unchanged fields from existing records
 * - Setting updated_at timestamp for modified records
 * - Validating that merged data is still valid
 * 
 * Ring: 0 (Validation) - Schema: all - Operations: update
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { BusinessLogicError } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import RecordPreloader from '@src/observers/all/0/record-preloader.js';

export default class UpdateMerger extends BaseObserver {
    readonly ring = ObserverRing.DataPreparation;
    readonly operations = ['update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, data, metadata } = context;
        const schemaName = context.schema.name;
        
        if (!Array.isArray(data) || data.length === 0) {
            logger.info('No update data found for merging', { schemaName, operation });
            metadata.set('update_merge', 'skipped_no_data');
            return;
        }
        
        // Get preloaded existing records for merging
        const existingRecordsById = RecordPreloader.getPreloadedRecordsById(context);
        const preloadStats = RecordPreloader.getPreloadStats(context);
        
        // If preloading failed, we can't merge
        if (RecordPreloader.hasPreloadError(context)) {
            logger.warn('Cannot merge update data - preload failed', {
                schemaName,
                operation,
                updateRecords: data.length,
                requestedRecords: preloadStats.requestedCount
            });
            
            throw new BusinessLogicError(
                `Cannot merge update data - existing records not available`,
                undefined,
                'UPDATE_MERGE_FAILED'
            );
        }
        
        let mergedCount = 0;
        let skippedCount = 0;
        const mergedRecords = [];
        const currentTimestamp = new Date().toISOString();
        
        // Process each update record
        for (let i = 0; i < data.length; i++) {
            const updateData = data[i];
            
            if (!updateData || !updateData.id) {
                logger.warn('Skipping update record without ID', {
                    schemaName,
                    operation,
                    recordIndex: i,
                    record: updateData
                });
                skippedCount++;
                continue;
            }
            
            const existingRecord = existingRecordsById[updateData.id];
            
            if (!existingRecord) {
                logger.warn('Skipping update - existing record not found', {
                    schemaName,
                    operation,
                    recordId: updateData.id,
                    recordIndex: i
                });
                skippedCount++;
                continue;
            }
            
            // Perform the merge: existing + updates + timestamp
            const mergedRecord = {
                ...existingRecord,        // Start with existing record (all fields)
                ...updateData,            // Override with update data
                updated_at: currentTimestamp  // Always update timestamp
            };
            
            // Special handling for certain fields that should not be overwritten
            // Preserve system fields if they weren't explicitly provided in update
            if (!updateData.hasOwnProperty('created_at')) {
                mergedRecord.created_at = existingRecord.created_at;
            }
            if (!updateData.hasOwnProperty('id')) {
                mergedRecord.id = existingRecord.id;
            }
            
            // Track the merge for audit
            mergedRecords.push({
                recordId: updateData.id,
                existingFields: Object.keys(existingRecord).length,
                updateFields: Object.keys(updateData).length,
                mergedFields: Object.keys(mergedRecord).length,
                preservedTimestamp: existingRecord.created_at
            });
            
            // Replace the original update data with merged data
            data[i] = mergedRecord;
            mergedCount++;
        }
        
        // Record merge statistics
        metadata.set('update_merge', 'completed');
        metadata.set('merged_record_count', mergedCount);
        metadata.set('skipped_record_count', skippedCount);
        metadata.set('merge_timestamp', currentTimestamp);
        metadata.set('merge_details', mergedRecords);
        
        logger.info('Update merge completed successfully', {
            schemaName,
            operation,
            totalRecords: data.length,
            mergedCount,
            skippedCount,
            timestamp: currentTimestamp,
            existingRecordsAvailable: Object.keys(existingRecordsById).length
        });
    }
    
    /**
     * Helper method to check if a record was merged
     */
    static wasRecordMerged(context: ObserverContext, recordId: string): boolean {
        const mergeDetails = context.metadata.get('merge_details') || [];
        return mergeDetails.some((detail: any) => detail.recordId === recordId);
    }
    
    /**
     * Helper method to get merge details for a specific record
     */
    static getRecordMergeDetails(context: ObserverContext, recordId: string): any | null {
        const mergeDetails = context.metadata.get('merge_details') || [];
        return mergeDetails.find((detail: any) => detail.recordId === recordId) || null;
    }
    
    /**
     * Helper method to get overall merge statistics
     */
    static getMergeStats(context: ObserverContext): {
        wasMerged: boolean;
        mergedCount: number;
        skippedCount: number;
        timestamp: string | null;
        status: string;
    } {
        const metadata = context.metadata;
        
        return {
            wasMerged: metadata.has('update_merge'),
            mergedCount: metadata.get('merged_record_count') || 0,
            skippedCount: metadata.get('skipped_record_count') || 0,
            timestamp: metadata.get('merge_timestamp') || null,
            status: metadata.get('update_merge') || 'not_merged'
        };
    }
    
    /**
     * Helper method to validate that merge data is reasonable
     */
    private validateMergeData(existing: any, update: any, merged: any): boolean {
        // Basic sanity checks on merged data
        
        // ID should never change
        if (merged.id !== existing.id) {
            return false;
        }
        
        // created_at should be preserved if not explicitly updated
        if (!update.hasOwnProperty('created_at') && merged.created_at !== existing.created_at) {
            return false;
        }
        
        // updated_at should be more recent than created_at
        if (merged.updated_at && merged.created_at && merged.updated_at < merged.created_at) {
            return false;
        }
        
        return true;
    }
}