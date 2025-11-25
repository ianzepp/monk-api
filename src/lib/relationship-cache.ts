import type { TxContext } from '@src/db/index.js';
import type { SystemContext } from '@src/lib/system-context-types.js';

/**
 * Cached relationship entry
 */
export interface CachedRelationship {
    fieldName: string;      // Foreign key field on child model
    childModel: string;     // Child model name
    relationshipType: string; // 'owned', 'referenced', etc.
}

/**
 * Cache key for relationship lookups
 * Format: "parentModel:relationshipName"
 */
type RelationshipKey = string;

/**
 * Database-specific relationship cache
 */
interface DatabaseRelationshipCache {
    relationships: Map<RelationshipKey, CachedRelationship | null>;
    loaded: boolean; // Whether all relationships have been loaded
}

/**
 * Multi-database relationship caching system
 *
 * Caches relationship metadata from the fields table for efficient lookups.
 * Relationships are defined by fields with related_model and relationship_name set.
 *
 * Cache key: "parentModel:relationshipName" -> { fieldName, childModel, relationshipType }
 */
export class RelationshipCache {
    private static instance: RelationshipCache | null = null;
    private databaseCaches = new Map<string, DatabaseRelationshipCache>();

    private constructor() {}

    static getInstance(): RelationshipCache {
        if (!RelationshipCache.instance) {
            RelationshipCache.instance = new RelationshipCache();
        }
        return RelationshipCache.instance;
    }

    /**
     * Get database identifier for cache key
     */
    private getDatabaseId(dtx: TxContext): string {
        try {
            const sessionInfo = (dtx as any)?.session?.connection?.database ||
                               (dtx as any)?.connection?.database ||
                               'system';
            return sessionInfo;
        } catch {
            return 'default';
        }
    }

    /**
     * Get or create database-specific cache
     */
    private getDatabaseCache(dtx: TxContext): DatabaseRelationshipCache {
        const dbId = this.getDatabaseId(dtx);

        if (!this.databaseCaches.has(dbId)) {
            this.databaseCaches.set(dbId, {
                relationships: new Map(),
                loaded: false,
            });
        }

        return this.databaseCaches.get(dbId)!;
    }

    /**
     * Build cache key from parent model and relationship name
     */
    private buildKey(parentModel: string, relationshipName: string): RelationshipKey {
        return `${parentModel}:${relationshipName}`;
    }

    /**
     * Load all relationships for a database into cache
     */
    private async loadAllRelationships(dtx: TxContext): Promise<void> {
        const dbCache = this.getDatabaseCache(dtx);

        if (dbCache.loaded) {
            return;
        }

        const result = await dtx.query(`
            SELECT
                related_model,
                relationship_name,
                field_name,
                model_name,
                relationship_type
            FROM fields
            WHERE related_model IS NOT NULL
              AND relationship_name IS NOT NULL
              AND relationship_type IS NOT NULL
              AND trashed_at IS NULL
              AND deleted_at IS NULL
        `);

        for (const row of result.rows as any[]) {
            const key = this.buildKey(row.related_model, row.relationship_name);
            dbCache.relationships.set(key, {
                fieldName: row.field_name,
                childModel: row.model_name,
                relationshipType: row.relationship_type,
            });
        }

        dbCache.loaded = true;
        console.info('Relationship cache loaded', {
            count: dbCache.relationships.size,
        });
    }

    /**
     * Get relationship metadata by parent model and relationship name
     *
     * @param system - System context with transaction
     * @param parentModel - Parent model name (the related_model in fields table)
     * @param relationshipName - Relationship name defined on the field
     * @returns Relationship metadata or null if not found
     */
    async getRelationship(
        system: SystemContext,
        parentModel: string,
        relationshipName: string
    ): Promise<CachedRelationship | null> {
        const dbCache = this.getDatabaseCache(system.tx);
        const key = this.buildKey(parentModel, relationshipName);

        // Load all relationships on first access (single query, then cached)
        if (!dbCache.loaded) {
            await this.loadAllRelationships(system.tx);
        }

        return dbCache.relationships.get(key) ?? null;
    }

    /**
     * Invalidate relationship cache for a database
     * Called when fields are modified via describe API
     */
    invalidate(system: SystemContext): void {
        const dbCache = this.getDatabaseCache(system.tx);
        dbCache.relationships.clear();
        dbCache.loaded = false;
        console.info('Relationship cache invalidated');
    }

    /**
     * Get cache statistics for debugging
     */
    getCacheStats(): Record<string, { count: number; loaded: boolean }> {
        const stats: Record<string, { count: number; loaded: boolean }> = {};

        for (const [dbId, dbCache] of this.databaseCaches.entries()) {
            stats[dbId] = {
                count: dbCache.relationships.size,
                loaded: dbCache.loaded,
            };
        }

        return stats;
    }
}
