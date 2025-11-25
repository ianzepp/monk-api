/**
 * PatternCache - Wildcard Pattern Caching System
 *
 * High-performance caching system for translated wildcard patterns.
 * Reduces translation overhead for repeated FS operations and provides
 * intelligent cache management with model-based invalidation.
 *
 * ## Key Features
 * - **Pattern Translation Caching**: Caches WildcardTranslation results
 * - **Model-based Invalidation**: Invalidates cache when model data changes
 * - **Usage Statistics**: Tracks hit counts and performance metrics
 * - **Memory Management**: LRU eviction and size limits
 * - **Performance Monitoring**: Cache hit/miss rates and optimization insights
 *
 * ## Cache Strategy
 * - **Cache Key**: SHA256 hash of pattern string for consistent keys
 * - **TTL**: Configurable time-to-live for cache entries
 * - **Size Limits**: Maximum number of cached patterns (default: 1000)
 * - **Model Tracking**: Maps models to cached patterns for targeted invalidation
 */

import { createHash } from 'crypto';
import type { WildcardTranslation } from '@src/lib/file-wildcard-translator.js';

export interface PatternCacheEntry {
    pattern: string; // Original FS pattern
    pattern_hash: string; // SHA256 hash of pattern
    translation: WildcardTranslation; // Cached translation result
    created_at: Date; // Cache entry creation time
    last_used: Date; // Last access time
    hit_count: number; // Number of times accessed
    ttl_expires: Date; // Time-to-live expiration
    models_referenced: string[]; // Models this pattern references
}

export interface CacheStats {
    total_entries: number; // Total cached patterns
    hit_count: number; // Total cache hits
    miss_count: number; // Total cache misses
    hit_rate: number; // Hit rate percentage (0-100)
    memory_usage_bytes: number; // Estimated memory usage
    oldest_entry: Date | null; // Oldest cache entry
    most_recent_entry: Date | null; // Most recent cache entry
    top_patterns: PatternUsageStats[]; // Most frequently used patterns
}

export interface PatternUsageStats {
    pattern: string;
    hit_count: number;
    last_used: Date;
    estimated_savings_ms: number; // Estimated time saved by caching
}

export interface CacheConfig {
    max_entries: number; // Maximum cached patterns
    default_ttl_minutes: number; // Default TTL in minutes
    enable_stats: boolean; // Enable performance statistics
    memory_limit_mb: number; // Memory usage limit
    cleanup_interval_minutes: number; // Cleanup frequency
}

/**
 * High-Performance Pattern Caching System
 *
 * Provides intelligent caching of wildcard pattern translations with
 * model-aware invalidation and comprehensive performance monitoring.
 */
export class PatternCache {
    private static cache: Map<string, PatternCacheEntry> = new Map();
    private static modelMap: Map<string, Set<string>> = new Map(); // model -> pattern_hashes
    private static stats = {
        hit_count: 0,
        miss_count: 0,
        last_cleanup: new Date(),
    };

    private static config: CacheConfig = {
        max_entries: 1000,
        default_ttl_minutes: 30,
        enable_stats: true,
        memory_limit_mb: 50,
        cleanup_interval_minutes: 10,
    };

    /**
     * Configure cache settings
     */
    static configure(newConfig: Partial<CacheConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Cache translated pattern for performance
     */
    static cachePattern(pattern: string, translation: WildcardTranslation): void {
        const patternHash = this.hashPattern(pattern);
        const now = new Date();
        const ttlExpires = new Date(now.getTime() + this.config.default_ttl_minutes * 60 * 1000);

        // Extract models referenced by this pattern
        const modelsReferenced = this.extractReferencedModels(pattern, translation);

        const entry: PatternCacheEntry = {
            pattern,
            pattern_hash: patternHash,
            translation,
            created_at: now,
            last_used: now,
            hit_count: 0,
            ttl_expires: ttlExpires,
            models_referenced: modelsReferenced,
        };

        // Store cache entry
        this.cache.set(patternHash, entry);

        // Update model mapping for invalidation
        for (const model of modelsReferenced) {
            if (!this.modelMap.has(model)) {
                this.modelMap.set(model, new Set());
            }
            this.modelMap.get(model)!.add(patternHash);
        }

        // Enforce cache size limits
        this.enforceCapacityLimits();

        // Schedule cleanup if needed
        this.scheduleCleanupIfNeeded();
    }

    /**
     * Retrieve cached translation
     */
    static get(pattern: string): WildcardTranslation | null {
        const patternHash = this.hashPattern(pattern);
        const entry = this.cache.get(patternHash);

        if (!entry) {
            if (this.config.enable_stats) {
                this.stats.miss_count++;
            }
            return null;
        }

        // Check TTL expiration
        if (new Date() > entry.ttl_expires) {
            this.cache.delete(patternHash);
            this.removeFromModelMap(patternHash, entry.models_referenced);

            if (this.config.enable_stats) {
                this.stats.miss_count++;
            }
            return null;
        }

        // Update usage statistics
        entry.last_used = new Date();
        entry.hit_count++;

        if (this.config.enable_stats) {
            this.stats.hit_count++;
        }

        return entry.translation;
    }

    /**
     * Invalidate cache based on model data changes
     */
    static invalidate(model: string): void {
        const patternHashes = this.modelMap.get(model);

        if (!patternHashes) {
            return; // No patterns reference this model
        }

        let invalidatedCount = 0;

        for (const patternHash of patternHashes) {
            const entry = this.cache.get(patternHash);

            if (entry) {
                this.cache.delete(patternHash);
                this.removeFromModelMap(patternHash, entry.models_referenced);
                invalidatedCount++;
            }
        }

        // Clear the model mapping
        this.modelMap.delete(model);

        console.debug(`PatternCache: Invalidated ${invalidatedCount} patterns for model '${model}'`);
    }

    /**
     * Invalidate all cached patterns
     */
    static invalidateAll(): void {
        const totalEntries = this.cache.size;
        this.cache.clear();
        this.modelMap.clear();

        console.debug(`PatternCache: Cleared all ${totalEntries} cached patterns`);
    }

    /**
     * Get comprehensive cache statistics
     */
    static getStats(): CacheStats {
        const entries = Array.from(this.cache.values());
        const totalHits = this.stats.hit_count;
        const totalMisses = this.stats.miss_count;
        const totalRequests = totalHits + totalMisses;

        // Calculate memory usage estimate
        const memoryUsage = this.estimateMemoryUsage();

        // Find oldest and newest entries
        let oldestEntry: Date | null = null;
        let newestEntry: Date | null = null;

        for (const entry of entries) {
            if (!oldestEntry || entry.created_at < oldestEntry) {
                oldestEntry = entry.created_at;
            }
            if (!newestEntry || entry.created_at > newestEntry) {
                newestEntry = entry.created_at;
            }
        }

        // Get top patterns by usage
        const topPatterns = entries
            .sort((a, b) => b.hit_count - a.hit_count)
            .slice(0, 10)
            .map(entry => ({
                pattern: entry.pattern,
                hit_count: entry.hit_count,
                last_used: entry.last_used,
                estimated_savings_ms: entry.hit_count * this.estimateTranslationCost(entry.translation.complexity),
            }));

        return {
            total_entries: entries.length,
            hit_count: totalHits,
            miss_count: totalMisses,
            hit_rate: totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
            memory_usage_bytes: memoryUsage,
            oldest_entry: oldestEntry,
            most_recent_entry: newestEntry,
            top_patterns: topPatterns,
        };
    }

    /**
     * Manual cleanup of expired entries
     */
    static cleanup(): void {
        const now = new Date();
        const expiredHashes: string[] = [];

        for (const [patternHash, entry] of this.cache.entries()) {
            if (now > entry.ttl_expires) {
                expiredHashes.push(patternHash);
            }
        }

        for (const patternHash of expiredHashes) {
            const entry = this.cache.get(patternHash);
            if (entry) {
                this.cache.delete(patternHash);
                this.removeFromModelMap(patternHash, entry.models_referenced);
            }
        }

        this.stats.last_cleanup = now;

        if (expiredHashes.length > 0) {
            console.debug(`PatternCache: Cleaned up ${expiredHashes.length} expired patterns`);
        }
    }

    /**
     * Generate consistent hash for pattern string
     */
    private static hashPattern(pattern: string): string {
        return createHash('sha256').update(pattern).digest('hex').substring(0, 16);
    }

    /**
     * Extract models referenced by pattern and translation
     */
    private static extractReferencedModels(pattern: string, translation: WildcardTranslation): string[] {
        const models = new Set<string>();

        // Add explicit models from translation
        for (const model of translation.models) {
            if (model && model !== '*') {
                models.add(model);
            }
        }

        // Parse pattern for model references
        const pathParts = pattern.split('/').filter(p => p.length > 0);

        if (pathParts.length >= 2 && pathParts[0] === 'data') {
            const modelName = pathParts[1];
            if (modelName && modelName !== '*' && !modelName.includes('*')) {
                models.add(modelName);
            }
        }

        return Array.from(models);
    }

    /**
     * Remove pattern hash from model mappings
     */
    private static removeFromModelMap(patternHash: string, models: string[]): void {
        for (const model of models) {
            const patternSet = this.modelMap.get(model);
            if (patternSet) {
                patternSet.delete(patternHash);
                if (patternSet.size === 0) {
                    this.modelMap.delete(model);
                }
            }
        }
    }

    /**
     * Enforce cache capacity limits using LRU eviction
     */
    private static enforceCapacityLimits(): void {
        if (this.cache.size <= this.config.max_entries) {
            return;
        }

        // Sort by last_used (LRU eviction)
        const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].last_used.getTime() - b[1].last_used.getTime());

        const evictCount = this.cache.size - this.config.max_entries;

        for (let i = 0; i < evictCount; i++) {
            const [patternHash, entry] = entries[i];
            this.cache.delete(patternHash);
            this.removeFromModelMap(patternHash, entry.models_referenced);
        }

        console.debug(`PatternCache: Evicted ${evictCount} least recently used patterns`);
    }

    /**
     * Schedule cleanup if needed
     */
    private static scheduleCleanupIfNeeded(): void {
        const now = new Date();
        const nextCleanup = new Date(this.stats.last_cleanup.getTime() + this.config.cleanup_interval_minutes * 60 * 1000);

        if (now > nextCleanup) {
            // Use setTimeout for non-blocking cleanup
            setTimeout(() => this.cleanup(), 0);
        }
    }

    /**
     * Estimate memory usage of cache
     */
    private static estimateMemoryUsage(): number {
        let totalBytes = 0;

        for (const entry of this.cache.values()) {
            // Rough estimation of entry size
            totalBytes += JSON.stringify(entry).length * 2; // Unicode characters = 2 bytes
        }

        // Add overhead for Map structure and model mappings
        totalBytes += this.cache.size * 100; // Estimated Map overhead
        totalBytes += this.modelMap.size * 50; // Estimated model map overhead

        return totalBytes;
    }

    /**
     * Estimate translation cost based on complexity
     */
    private static estimateTranslationCost(complexity: 'simple' | 'complex' | 'cross'): number {
        switch (complexity) {
            case 'simple':
                return 5; // 5ms
            case 'complex':
                return 20; // 20ms
            case 'cross':
                return 50; // 50ms
            default:
                return 10;
        }
    }
}
