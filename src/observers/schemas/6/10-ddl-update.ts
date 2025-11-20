/**
 * DDL Update Observer - Ring 6 PostDatabase
 *
 * Handles schema updates in ring 6. Since schema updates only affect metadata
 * (status field), no DDL operations are needed. Table structure changes happen
 * via column operations, not schema updates.
 *
 * This observer exists for completeness but is essentially a no-op.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class DdlUpdateObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['update'] as const;
    readonly priority = 10;  // High priority - DDL should run before data transformations

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const schemaName = record.schema_name;

        // Skip DDL operations for external schemas (managed elsewhere)
        if (record.external === true) {
            logger.info(`Skipping DDL operation for external schema: ${schemaName}`);
            return;
        }

        // Schema updates only affect metadata (status field)
        // No DDL operations needed - table structure is managed by column operations
        logger.debug(`Schema metadata updated: ${schemaName}`, {
            status: record.status
        });

        // No DDL execution - this is intentionally a no-op
    }
}
