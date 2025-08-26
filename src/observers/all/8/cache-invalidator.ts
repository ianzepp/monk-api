/**
 * Cache Invalidator Observer
 * 
 * Universal integration observer that invalidates caches after data changes
 * Ring: 8 (Integration) - Schema: all - Operations: create, update, delete
 */

import { BaseAsyncObserver } from '@lib/observers/base-async-observer.js';
import { SystemError } from '@lib/observers/errors.js';
import type { ObserverContext } from '@lib/observers/interfaces.js';
import { ObserverRing } from '@lib/observers/types.js';
import { logger } from '@lib/logger.js';

export default class CacheInvalidator extends BaseAsyncObserver {
    readonly ring = ObserverRing.Integration;
    readonly operations = ['create', 'update', 'delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { schemaName, result, existing, metadata, operation, data } = context;
        
        // Process data as array if needed
        const recordsToProcess = Array.isArray(data) ? data : [{ result, existing }];
        
        try {
            // Invalidate schema-level caches (once per execution)
            await this.invalidateSchemaCache(schemaName);
            
            // Process each record
            for (const record of recordsToProcess) {
                const recordResult = record.result || result;
                const recordExisting = record.existing || existing;
                
                // Invalidate record-level caches
                const recordId = this.getRecordId(recordResult, recordExisting);
                if (recordId) {
                    await this.invalidateRecordCache(schemaName, recordId);
                }
                
                // Invalidate relationship caches
                await this.invalidateRelationshipCaches(schemaName, recordResult, recordExisting);
            }
            
            // Invalidate search/index caches
            await this.invalidateSearchCache(schemaName, operation);
            
            // Mark cache invalidation complete
            metadata.set('cache_invalidated', true);
            metadata.set('cache_invalidation_timestamp', new Date().toISOString());
            
        } catch (error) {
            // Cache invalidation failures are system errors
            throw new SystemError(
                `Cache invalidation failed for ${schemaName} ${operation}: ${error}`,
                error instanceof Error ? error : undefined
            );
        }
    }

    private async invalidateSchemaCache(schema: string): Promise<void> {
        // Invalidate schema-wide caches
        const cacheKeys = [
            `schema:${schema}:all`,
            `schema:${schema}:count`,
            `schema:${schema}:metadata`,
            `api:${schema}:list`,
            `api:${schema}:paginated`
        ];
        
        await this.invalidateKeys(cacheKeys);
        logger.info('Cache invalidated for schema', { schema });
    }

    private async invalidateRecordCache(schema: string, recordId: string): Promise<void> {
        // Invalidate record-specific caches
        const cacheKeys = [
            `record:${schema}:${recordId}`,
            `api:${schema}:${recordId}`,
            `permissions:${schema}:${recordId}`
        ];
        
        await this.invalidateKeys(cacheKeys);
        logger.info('Cache invalidated for record', { schema, recordId });
    }

    private async invalidateRelationshipCaches(schema: string, result: any, existing: any): Promise<void> {
        // Get relationship fields that might have changed
        const relationships = this.getRelationshipFields(schema);
        const record = result || existing;
        
        if (!record || relationships.length === 0) return;
        
        const cacheKeys: string[] = [];
        
        for (const relationship of relationships) {
            const relationshipValue = record[relationship.field];
            if (relationshipValue) {
                // Invalidate caches for related records
                if (Array.isArray(relationshipValue)) {
                    relationshipValue.forEach(relatedId => {
                        cacheKeys.push(`record:${relationship.schema}:${relatedId}`);
                        cacheKeys.push(`relationships:${relationship.schema}:${relatedId}`);
                    });
                } else {
                    cacheKeys.push(`record:${relationship.schema}:${relationshipValue}`);
                    cacheKeys.push(`relationships:${relationship.schema}:${relationshipValue}`);
                }
            }
        }
        
        if (cacheKeys.length > 0) {
            await this.invalidateKeys(cacheKeys);
            logger.info('Cache invalidated for relationships', { schema });
        }
    }

    private async invalidateSearchCache(schema: string, operation: string): Promise<void> {
        // Invalidate search and aggregation caches
        const searchKeys = [
            `search:${schema}:*`,
            `aggregation:${schema}:*`,
            `index:${schema}:*`,
            `filter:${schema}:*`
        ];
        
        await this.invalidateKeys(searchKeys);
        
        // For create/delete operations, also invalidate count caches
        if (operation === 'create' || operation === 'delete') {
            await this.invalidateKeys([
                `count:${schema}:total`,
                `count:${schema}:active`,
                `stats:${schema}:summary`
            ]);
        }
        
        logger.info('Cache invalidated for search', { schema });
    }

    private async invalidateKeys(keys: string[]): Promise<void> {
        // In a real implementation, this would interface with Redis, Memcached, etc.
        // For now, we'll just log the cache invalidation
        
        for (const key of keys) {
            if (key.includes('*')) {
                // Pattern-based invalidation
                logger.info('Cache pattern invalidated', { key });
                // await cache.deletePattern(key);
            } else {
                // Specific key invalidation
                logger.info('Cache key invalidated', { key });
                // await cache.delete(key);
            }
        }
    }

    private getRecordId(result: any, existing: any): string | null {
        return result?.id || existing?.id || null;
    }

    private getRelationshipFields(schema: string): Array<{field: string, schema: string}> {
        // In a real implementation, this would come from schema metadata
        // For now, return common relationship patterns
        const relationships: Record<string, Array<{field: string, schema: string}>> = {
            user: [
                { field: 'account_id', schema: 'account' },
                { field: 'role_ids', schema: 'role' }
            ],
            account: [
                { field: 'user_ids', schema: 'user' },
                { field: 'parent_account_id', schema: 'account' }
            ],
            // Add more schema relationships as needed
        };
        
        return relationships[schema] || [];
    }
}