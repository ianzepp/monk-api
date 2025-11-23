import crypto from 'crypto';
import type { DbContext, TxContext } from '@src/db/index.js';
import type { SystemContextWithInfrastructure } from '@src/lib/system-context-types.js';

// Cached model entry
interface CachedModel {
    model: any | null; // Full model object (lazy loaded)
    fields: any[] | null; // Field metadata (lazy loaded with model)
    updatedAt: string; // Last update timestamp for cache validation
}

// Database-specific cache
interface DatabaseCache {
    databaseUrl: string;
    models: Map<string, CachedModel>;
    lastChecksumRefresh: number; // Timestamp of last checksum validation
}

/**
 * Multi-database model caching system with timestamp-based invalidation
 *
 * Each database gets its own cache space to handle multi-tenant architecture.
 * Uses models.updated_at for efficient cache validation without fetching full models.
 */
export class ModelCache {
    private static instance: ModelCache | null = null;
    private databaseCaches = new Map<string, DatabaseCache>();

    // Cache refresh interval (5 minutes)
    private static readonly CHECKSUM_REFRESH_INTERVAL = 5 * 60 * 1000;

    private constructor() {}

    static getInstance(): ModelCache {
        if (!ModelCache.instance) {
            ModelCache.instance = new ModelCache();
        }
        return ModelCache.instance;
    }

    /**
     * Get database URL for cache key generation
     */
    private getDatabaseUrl(dtx: DbContext | TxContext): string {
        // Use connection string from the database context
        // Extract database name from the connection or use a simple identifier
        try {
            // Try to get database info from the session
            const sessionInfo = (dtx as any)?.session?.connection?.database || (dtx as any)?.connection?.database || 'system';
            return sessionInfo;
        } catch (error) {
            // Fallback to a simple identifier based on object reference
            return `db_${Object.prototype.toString.call(dtx).slice(8, -1)}_${Date.now()}`;
        }
    }

    /**
     * Get or create database-specific cache
     */
    private getDatabaseCache(dtx: DbContext | TxContext): DatabaseCache {
        const databaseUrl = this.getDatabaseUrl(dtx);

        if (!this.databaseCaches.has(databaseUrl)) {
            this.databaseCaches.set(databaseUrl, {
                databaseUrl,
                models: new Map(),
                lastChecksumRefresh: 0,
            });
        }

        return this.databaseCaches.get(databaseUrl)!;
    }

    /**
     * Load all model timestamps for a database
     */
    private async loadModelChecksums(dtx: DbContext | TxContext): Promise<{ model_name: string; updated_at: string }[]> {
        const result = await dtx.query(`
            SELECT s.model_name, s.updated_at
            FROM models s
            WHERE s.status IN ('active', 'system')
        `);

        return result.rows as any[];
    }

    /**
     * Validate cache checksums for a database
     */
    private async validateCacheChecksums(dtx: DbContext | TxContext, modelNames?: string[]): Promise<void> {
        const dbCache = this.getDatabaseCache(dtx);
        const now = Date.now();

        // Skip if recently refreshed (unless specific models requested)
        if (!modelNames && now - dbCache.lastChecksumRefresh < ModelCache.CHECKSUM_REFRESH_INTERVAL) {
            return;
        }

        try {
            let currentChecksums;

            if (modelNames && modelNames.length > 0) {
                // Query specific models using raw SQL (consistent with our approach)
                const quotedNames = modelNames.map(name => `'${name.replace(/'/g, "''")}'`).join(', ');
                const result = await dtx.query(`
                    SELECT s.model_name, s.updated_at
                    FROM models s
                    WHERE s.model_name IN (${quotedNames}) AND s.status IN ('active', 'system')
                `);
                currentChecksums = result.rows;
            } else {
                // Query all models
                currentChecksums = await this.loadModelChecksums(dtx);
            }

            // Compare timestamps and invalidate stale entries
            for (const row of currentChecksums as any[]) {
                const cached = dbCache.models.get(row.model_name);

                if (cached && cached.updatedAt !== row.updated_at) {
                    // Timestamp mismatch - invalidate cache entry
                    dbCache.models.delete(row.model_name);
                    console.info('Model cache invalidated', { modelName: row.model_name, reason: 'timestamp changed' });
                } else if (!cached) {
                    // New model found - add minimal cache entry
                    dbCache.models.set(row.model_name, {
                        model: null, // Lazy load
                        fields: null, // Lazy load with model
                        updatedAt: row.updated_at,
                    });
                    console.info('Model cache entry created', { modelName: row.model_name });
                }
            }

            // Update refresh timestamp
            if (!modelNames) {
                dbCache.lastChecksumRefresh = now;
            }
        } catch (error) {
            console.warn('Failed to validate model checksums', { error: error instanceof Error ? error.message : String(error) });
            // Fail gracefully - don't break the request
        }
    }

    /**
     * Load full model metadata and fields from database
     */
    private async loadFullModel(dtx: DbContext | TxContext, modelName: string): Promise<{ model: any; fields: any[] }> {
        // Load model metadata
        const modelResult = await dtx.query(
            `
            SELECT *
            FROM models
            WHERE model_name = $1
            AND status IN ('active', 'system')
            AND trashed_at IS NULL
            AND deleted_at IS NULL
        `,
            [modelName]
        );

        if (modelResult.rows.length === 0) {
            throw new Error(`Model '${modelName}' not found or trashed/deleted`);
        }

        // Load all field metadata (using SELECT * for future-proofing)
        const fieldsResult = await dtx.query(
            `
            SELECT *
            FROM fields
            WHERE model_name = $1
            AND trashed_at IS NULL
            AND deleted_at IS NULL
        `,
            [modelName]
        );

        return {
            model: modelResult.rows[0],
            fields: fieldsResult.rows,
        };
    }

    /**
     * Get model with caching
     *
     * Trust-based caching: models are cached indefinitely and invalidated explicitly
     * when modified via describe API. No checksum validation on reads - all model
     * writes are controlled through describe.ts which invalidates the cache.
     */
    async getModel(system: SystemContextWithInfrastructure, modelName: string): Promise<any> {
        const dbCache = this.getDatabaseCache(system.db);

        // 1. Check cache first - trust it if present
        const cached = dbCache.models.get(modelName);
        if (cached?.model && cached?.fields) {
            console.info('Model cache hit', { modelName });
            // Return model with fields attached for performance
            return { ...cached.model, _fields: cached.fields };
        }

        // 2. Cache miss - load full model and fields from database
        console.info('Model cache miss - loading from database', { modelName });
        const { model, fields } = await this.loadFullModel(system.db, modelName);

        // 3. Store in cache
        dbCache.models.set(modelName, {
            model,
            fields,
            updatedAt: model.updated_at,
        });

        // Return model with fields attached for performance
        return { ...model, _fields: fields };
    }

    /**
     * Invalidate specific model in cache (for updates)
     */
    invalidateModel(system: SystemContextWithInfrastructure, modelName: string): void {
        const dbCache = this.getDatabaseCache(system.db);
        dbCache.models.delete(modelName);
        console.info('Model cache invalidated manually', { modelName });
    }

    /**
     * Get cache statistics for debugging
     */
    getCacheStats(): any {
        const stats: any = {};

        for (const [dbUrl, dbCache] of this.databaseCaches.entries()) {
            const loaded = Array.from(dbCache.models.values()).filter(s => s.model !== null).length;
            const total = dbCache.models.size;

            stats[dbUrl] = {
                total,
                loaded,
                hit_ratio: total > 0 ? loaded / total : 0,
                last_refresh: new Date(dbCache.lastChecksumRefresh).toISOString(),
            };
        }

        return stats;
    }
}
