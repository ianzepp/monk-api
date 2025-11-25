/**
 * Model Cache Invalidator - Ring 8 Integration
 *
 * Automatically invalidates caches when models are modified.
 * Invalidates both NamespaceCache (new) and ModelCache (deprecated).
 *
 * Note: Model modifications already update models.updated_at (system field),
 * so we only need to invalidate the in-memory cache here.
 *
 * This observer runs AFTER database changes are committed (Ring 8), ensuring
 * that cache is only invalidated for successfully persisted changes.
 *
 * Ring: 8 (Integration) - After database changes are committed
 * Model: models
 * Operations: create, update, delete
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ModelCache } from '@src/lib/model-cache.js';
import type { ModelRecord } from '@src/lib/model-record.js';

export default class ModelCacheInvalidator extends BaseObserver {
    readonly ring = ObserverRing.Integration;  // Ring 8
    readonly operations = ['create', 'update', 'delete'] as const;

    async executeOne(record: ModelRecord, context: ObserverContext): Promise<void> {
        const { model_name } = record;

        if (!model_name) {
            console.warn('Cannot invalidate model cache - no model_name in record', {
                record,
                operation: context.operation
            });
            return;
        }

        // Invalidate NamespaceCache (new schema-aware cache) and reload
        if (context.system.namespace?.isLoaded()) {
            context.system.namespace.invalidateModel(model_name);
            await context.system.namespace.loadOne(context.system, model_name);
        }

        // Invalidate legacy ModelCache (deprecated)
        const modelCache = ModelCache.getInstance();
        modelCache.invalidateModel(context.system, model_name);

        console.info('Model cache invalidated by observer', {
            operation: context.operation,
            model_name,
            ring: this.ring,
            reason: 'model metadata modified'
        });
    }
}
