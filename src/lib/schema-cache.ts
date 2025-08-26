import type { SystemContextWithInfrastructure } from '@src/lib/types/system-context.js';
import type { DbContext, TxContext } from '@src/db/index.js';
import crypto from 'crypto';

// Cached schema entry
interface CachedSchema {
    schema: any | null;           // Full schema object (lazy loaded)
    yamlChecksum: string;         // Checksum for cache validation
    updatedAt: string;            // Last update timestamp
    validator?: Function;         // Compiled JSON Schema validator (lazy loaded)
}

// Database-specific cache
interface DatabaseCache {
    databaseUrl: string;
    schemas: Map<string, CachedSchema>;
    lastChecksumRefresh: number;  // Timestamp of last checksum validation
}

/**
 * Multi-database schema caching system with checksum-based invalidation
 * 
 * Each database gets its own cache space to handle multi-tenant architecture.
 * Uses yaml_checksum for efficient cache validation without fetching full schemas.
 */
export class SchemaCache {
    private static instance: SchemaCache | null = null;
    private databaseCaches = new Map<string, DatabaseCache>();
    
    // Cache refresh interval (5 minutes)
    private static readonly CHECKSUM_REFRESH_INTERVAL = 5 * 60 * 1000;
    
    private constructor() {}
    
    static getInstance(): SchemaCache {
        if (!SchemaCache.instance) {
            SchemaCache.instance = new SchemaCache();
        }
        return SchemaCache.instance;
    }
    
    /**
     * Get database URL for cache key generation
     */
    private getDatabaseUrl(dtx: DbContext | TxContext): string {
        // Use connection string from the database context
        // Extract database name from the connection or use a simple identifier
        try {
            // Try to get database info from the session
            const sessionInfo = (dtx as any)?.session?.connection?.database || 
                               (dtx as any)?.connection?.database ||
                               'default';
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
                schemas: new Map(),
                lastChecksumRefresh: 0
            });
        }
        
        return this.databaseCaches.get(databaseUrl)!;
    }
    
    /**
     * Load all schema checksums for a database
     */
    private async loadSchemaChecksums(dtx: DbContext | TxContext): Promise<{name: string, yaml_checksum: string, updated_at: string}[]> {
        const result = await dtx.query(`
            SELECT name, yaml_checksum, updated_at 
            FROM schema 
            WHERE status IN ('active', 'system')
        `);
        
        return result.rows as any[];
    }
    
    /**
     * Validate cache checksums for a database
     */
    private async validateCacheChecksums(dtx: DbContext | TxContext, schemaNames?: string[]): Promise<void> {
        const dbCache = this.getDatabaseCache(dtx);
        const now = Date.now();
        
        // Skip if recently refreshed (unless specific schemas requested)
        if (!schemaNames && (now - dbCache.lastChecksumRefresh) < SchemaCache.CHECKSUM_REFRESH_INTERVAL) {
            return;
        }
        
        try {
            let currentChecksums;
            
            if (schemaNames && schemaNames.length > 0) {
                // Query specific schemas using raw SQL (consistent with our approach)
                const quotedNames = schemaNames.map(name => `'${name.replace(/'/g, "''")}'`).join(', ');
                const result = await dtx.query(`
                    SELECT name, yaml_checksum, updated_at 
                    FROM schema 
                    WHERE name IN (${quotedNames}) AND status IN ('active', 'system')
                `);
                currentChecksums = result.rows;
            } else {
                // Query all schemas
                currentChecksums = await this.loadSchemaChecksums(dtx);
            }
            
            // Compare checksums and invalidate stale entries
            for (const row of currentChecksums as any[]) {
                const cached = dbCache.schemas.get(row.name);
                
                if (cached && cached.yamlChecksum !== row.yaml_checksum) {
                    // Checksum mismatch - invalidate cache entry
                    dbCache.schemas.delete(row.name);
                    logger.info('Schema cache invalidated', { schemaName: row.name, reason: 'checksum changed' });
                } else if (!cached) {
                    // New schema found - add minimal cache entry
                    dbCache.schemas.set(row.name, {
                        schema: null, // Lazy load
                        yamlChecksum: row.yaml_checksum,
                        updatedAt: row.updated_at,
                        validator: undefined
                    });
                    logger.info('Schema cache entry created', { schemaName: row.name });
                }
            }
            
            // Update refresh timestamp
            if (!schemaNames) {
                dbCache.lastChecksumRefresh = now;
            }
            
        } catch (error) {
            logger.warn('Failed to validate schema checksums', { error: error instanceof Error ? error.message : String(error) });
            // Fail gracefully - don't break the request
        }
    }
    
    /**
     * Load full schema definition from database
     */
    private async loadFullSchema(dtx: DbContext | TxContext, schemaName: string): Promise<any> {
        const result = await dtx.query(`
            SELECT * FROM schema 
            WHERE name = $1 AND status IN ('active', 'system')
        `, [schemaName]);
        
        if (result.rows.length === 0) {
            throw new Error(`Schema '${schemaName}' not found`);
        }
        
        return result.rows[0];
    }
    
    /**
     * Get schema with caching
     */
    async getSchema(system: SystemContextWithInfrastructure, schemaName: string): Promise<any> {
        const dbCache = this.getDatabaseCache(system.db);
        
        // 1. Validate checksums (batch operation, infrequent)
        await this.validateCacheChecksums(system.db, [schemaName]);
        
        // 2. Check cache
        const cached = dbCache.schemas.get(schemaName);
        if (cached?.schema) {
            logger.info('Schema cache hit', { schemaName });
            return cached.schema;
        }
        
        // 3. Cache miss - load full schema
        logger.info('Schema cache miss', { schemaName });
        const schema = await this.loadFullSchema(system.db, schemaName);
        
        // 4. Update cache with full schema
        if (cached) {
            cached.schema = schema;
        } else {
            // Shouldn't happen after validateCacheChecksums, but handle gracefully
            dbCache.schemas.set(schemaName, {
                schema,
                yamlChecksum: schema.yaml_checksum || '',
                updatedAt: schema.updated_at,
                validator: undefined
            });
        }
        
        return schema;
    }
    
    /**
     * Invalidate specific schema in cache (for updates)
     */
    invalidateSchema(system: SystemContextWithInfrastructure, schemaName: string): void {
        const dbCache = this.getDatabaseCache(system.db);
        dbCache.schemas.delete(schemaName);
        logger.info('Schema cache invalidated manually', { schemaName });
    }
    
    /**
     * Get cache statistics for debugging
     */
    getCacheStats(): any {
        const stats: any = {};
        
        for (const [dbUrl, dbCache] of this.databaseCaches.entries()) {
            const loaded = Array.from(dbCache.schemas.values()).filter(s => s.schema !== null).length;
            const total = dbCache.schemas.size;
            
            stats[dbUrl] = {
                total,
                loaded,
                hit_ratio: total > 0 ? loaded / total : 0,
                last_refresh: new Date(dbCache.lastChecksumRefresh).toISOString()
            };
        }
        
        return stats;
    }
}