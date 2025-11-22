/**
 * Schema Cache Invalidator - Ring 8 Integration
 *
 * Automatically invalidates SchemaCache when schemas are modified.
 * Ensures cache stays consistent without manual invalidation in Describe class.
 *
 * Note: Schema modifications already update schemas.updated_at (system field),
 * so we only need to invalidate the in-memory cache here.
 *
 * This observer runs AFTER database changes are committed (Ring 8), ensuring
 * that cache is only invalidated for successfully persisted changes.
 *
 * Ring: 8 (Integration) - After database changes are committed
 * Schema: schemas
 * Operations: create, update, delete
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class SchemaCacheInvalidator extends BaseObserver {
    readonly ring = ObserverRing.Integration;  // Ring 8
    readonly operations = ['create', 'update', 'delete'] as const;

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { schema_name } = record;

        if (!schema_name) {
            console.warn('Cannot invalidate schema cache - no schema_name in record', {
                record,
                operation: context.operation
            });
            return;
        }

        // Invalidate the schema cache
        const schemaCache = SchemaCache.getInstance();
        schemaCache.invalidateSchema(context.system, schema_name);

        console.info('Schema cache invalidated by observer', {
            operation: context.operation,
            schema_name,
            ring: this.ring,
            reason: 'schema metadata modified'
        });
    }
}
