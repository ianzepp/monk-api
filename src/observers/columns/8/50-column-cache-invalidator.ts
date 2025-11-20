/**
 * Column Cache Invalidator - Ring 8 Integration
 *
 * Automatically invalidates SchemaCache when columns are modified.
 * Column changes affect the parent schema's cached metadata,
 * so we must both update the parent schema's timestamp and invalidate the cache.
 *
 * This observer runs AFTER database changes are committed (Ring 8), ensuring
 * that cache is only invalidated for successfully persisted changes.
 *
 * Ring: 8 (Integration) - After database changes are committed
 * Schema: columns
 * Operations: create, update, delete
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';

export default class ColumnCacheInvalidator extends BaseObserver {
    readonly ring = ObserverRing.Integration;  // Ring 8
    readonly operations = ['create', 'update', 'delete'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const schemaName = record.schema_name;

        if (!schemaName) {
            logger.warn('Cannot invalidate schema cache - no schema_name in column record', {
                record,
                operation: context.operation,
                columnName: record.column_name
            });
            return;
        }

        // Update parent schema's updated_at timestamp in database
        // This ensures timestamp-based cache validation detects column changes
        const query = `UPDATE schemas SET updated_at = now() WHERE schema_name = $1`;
        await SqlUtils.getPool(context.system).query(query, [schemaName]);

        // Invalidate the parent schema's in-memory cache
        // Column changes affect the schema's cached metadata, so we must
        // invalidate the schema cache to ensure fresh schema definitions are loaded
        const schemaCache = SchemaCache.getInstance();
        schemaCache.invalidateSchema(context.system, schemaName);

        logger.info('Schema cache invalidated by column change', {
            operation: context.operation,
            schemaName,
            columnName: record.column_name,
            ring: this.ring,
            reason: 'column definition modified'
        });
    }
}
