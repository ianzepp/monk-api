/**
 * Update Merger Observer
 *
 * SIMPLIFIED with ModelRecord: Now just sets updated_at timestamp.
 * The actual merging of existing + update data is handled by ModelRecord.toObject()
 * which is called in the SQL layer.
 *
 * This observer ensures:
 * - updated_at timestamp is set for all update operations
 * - Timestamp is not set if explicitly provided (for imports/migrations)
 *
 * Ring: 0 (DataPreparation) - Model: all - Operations: update
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class UpdateMerger extends BaseObserver {
    readonly ring = ObserverRing.DataPreparation;
    readonly operations = ['update'] as const;
    readonly priority = 50; // Run after RecordPreloader (priority 10)

    async execute(context: ObserverContext): Promise<void> {
        const { data } = context;
        const modelName = context.model.model_name;

        if (!data || data.length === 0) {
            console.info('No update data found for timestamp processing', { modelName });
            return;
        }

        const currentTimestamp = new Date().toISOString();
        let processedCount = 0;

        // Set updated_at timestamp on each record (unless explicitly provided)
        for (const record of data) {
            if (!record.has('updated_at')) {
                record.set('updated_at', currentTimestamp);
                processedCount++;
            }
        }

        console.info('Update timestamp processing completed', {
            modelName,
            totalRecords: data.length,
            timestampsSet: processedCount
        });
    }
}
