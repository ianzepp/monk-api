/**
 * PatternCache Unit Tests
 *
 * Comprehensive test coverage for the pattern caching system,
 * including cache operations, schema-based invalidation,
 * memory management, and performance monitoring.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PatternCache, PatternCacheEntry, CacheStats } from '@src/ftp/pattern-cache.js';
import { WildcardTranslation } from '@src/ftp/wildcard-translator.js';
describe('PatternCache - Pattern Caching System', () => {
    beforeEach(() => {
        // Clear cache before each test
        PatternCache.invalidateAll();
        PatternCache.configure({
            max_entries: 1000,
            default_ttl_minutes: 30,
            enable_stats: true,
            memory_limit_mb: 50,
            cleanup_interval_minutes: 10
        });
    });
    afterEach(() => {
        // Clean up after tests
        PatternCache.invalidateAll();
    });
    describe('Basic Cache Operations', () => {
        test('should cache and retrieve pattern translation', () => {
            const pattern = '/data/users/admin*';
            const translation = {
                schemas: ['users'],
                filter: { where: { id: { $like: 'admin%' } } },
                cross_schema: false,
                complexity: 'complex',
                optimization_applied: ['pattern_optimization'],
                estimated_cost: 25
            };
            // Cache the pattern
            PatternCache.cachePattern(pattern, translation);
            // Retrieve from cache
            const cached = PatternCache.get(pattern);
            expect(cached).not.toBeNull();
            expect(cached?.complexity).toBe('complex');
            expect(cached?.schemas).toEqual(['users']);
            expect(cached?.estimated_cost).toBe(25);
        });
        test('should return null for non-existent patterns', () => {
            const result = PatternCache.get('/data/nonexistent/pattern*');
            expect(result).toBeNull();
        });
        test('should handle duplicate caching gracefully', () => {
            const pattern = '/data/accounts/user*';
            const translation = {
                schemas: ['accounts'],
                filter: { where: { username: { $like: 'user%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 15
            };
            // Cache the same pattern twice
            PatternCache.cachePattern(pattern, translation);
            PatternCache.cachePattern(pattern, translation);
            const cached = PatternCache.get(pattern);
            expect(cached).not.toBeNull();
            expect(cached?.complexity).toBe('simple');
        });
        test('should update hit count on cache access', () => {
            const pattern = '/data/products/item*';
            const translation = {
                schemas: ['products'],
                filter: { where: { item_id: { $like: 'item%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            PatternCache.cachePattern(pattern, translation);
            // Access multiple times
            PatternCache.get(pattern);
            PatternCache.get(pattern);
            PatternCache.get(pattern);
            const stats = PatternCache.getStats();
            expect(stats.hit_count).toBe(3);
            expect(stats.miss_count).toBe(0);
        });
    });
    describe('TTL and Expiration', () => {
        test('should respect TTL configuration', () => {
            // Set very short TTL for testing
            PatternCache.configure({
                max_entries: 1000,
                default_ttl_minutes: 0.001, // ~60ms
                enable_stats: true,
                memory_limit_mb: 50,
                cleanup_interval_minutes: 10
            });
            const pattern = '/data/temp/expired*';
            const translation = {
                schemas: ['temp'],
                filter: { where: { id: { $like: 'expired%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 5
            };
            PatternCache.cachePattern(pattern, translation);
            // Should be available immediately
            expect(PatternCache.get(pattern)).not.toBeNull();
            // Wait for expiration (in real tests, we'd mock time)
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(PatternCache.get(pattern)).toBeNull();
                    resolve(undefined);
                }, 100);
            });
        });
        test('should handle manual cleanup of expired entries', () => {
            PatternCache.configure({
                max_entries: 1000,
                default_ttl_minutes: 0.001,
                enable_stats: true,
                memory_limit_mb: 50,
                cleanup_interval_minutes: 10
            });
            const pattern = '/data/cleanup/test*';
            const translation = {
                schemas: ['cleanup'],
                filter: { where: { id: { $like: 'test%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 5
            };
            PatternCache.cachePattern(pattern, translation);
            // Force cleanup after TTL expires
            return new Promise((resolve) => {
                setTimeout(() => {
                    PatternCache.cleanup();
                    expect(PatternCache.get(pattern)).toBeNull();
                    resolve(undefined);
                }, 100);
            });
        });
    });
    describe('Schema-Based Invalidation', () => {
        test('should invalidate patterns by schema', () => {
            const userPattern = '/data/users/admin*';
            const accountPattern = '/data/accounts/user*';
            const productPattern = '/data/products/item*';
            const userTranslation = {
                schemas: ['users'],
                filter: { where: { id: { $like: 'admin%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            const accountTranslation = {
                schemas: ['accounts'],
                filter: { where: { id: { $like: 'user%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            const productTranslation = {
                schemas: ['products'],
                filter: { where: { id: { $like: 'item%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            // Cache all patterns
            PatternCache.cachePattern(userPattern, userTranslation);
            PatternCache.cachePattern(accountPattern, accountTranslation);
            PatternCache.cachePattern(productPattern, productTranslation);
            // Verify all are cached
            expect(PatternCache.get(userPattern)).not.toBeNull();
            expect(PatternCache.get(accountPattern)).not.toBeNull();
            expect(PatternCache.get(productPattern)).not.toBeNull();
            // Invalidate users schema
            PatternCache.invalidate('users');
            // Only users pattern should be invalidated
            expect(PatternCache.get(userPattern)).toBeNull();
            expect(PatternCache.get(accountPattern)).not.toBeNull();
            expect(PatternCache.get(productPattern)).not.toBeNull();
        });
        test('should handle multi-schema pattern invalidation', () => {
            const crossSchemaPattern = '/data/*/active';
            const translation = {
                schemas: ['users', 'accounts', 'products'],
                filter: { where: { status: 'active' } },
                cross_schema: true,
                complexity: 'cross',
                optimization_applied: ['cross_schema_optimization'],
                estimated_cost: 75
            };
            PatternCache.cachePattern(crossSchemaPattern, translation);
            expect(PatternCache.get(crossSchemaPattern)).not.toBeNull();
            // Invalidating any referenced schema should invalidate the pattern
            PatternCache.invalidate('accounts');
            expect(PatternCache.get(crossSchemaPattern)).toBeNull();
        });
        test('should handle invalidation of non-existent schema', () => {
            const pattern = '/data/existing/test*';
            const translation = {
                schemas: ['existing'],
                filter: { where: { id: { $like: 'test%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            PatternCache.cachePattern(pattern, translation);
            // Should not crash or affect existing entries
            PatternCache.invalidate('nonexistent');
            expect(PatternCache.get(pattern)).not.toBeNull();
        });
    });
    describe('Memory Management and Capacity', () => {
        test('should enforce maximum entries limit with LRU eviction', () => {
            // Set small capacity for testing
            PatternCache.configure({
                max_entries: 3,
                default_ttl_minutes: 30,
                enable_stats: true,
                memory_limit_mb: 50,
                cleanup_interval_minutes: 10
            });
            const patterns = [
                '/data/test1/pattern*',
                '/data/test2/pattern*',
                '/data/test3/pattern*',
                '/data/test4/pattern*' // This should evict the least recently used
            ];
            const baseTranslation = {
                schemas: ['test'],
                filter: { where: { id: { $like: 'pattern%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            // Cache patterns sequentially
            for (let i = 0; i < patterns.length; i++) {
                PatternCache.cachePattern(patterns[i], { ...baseTranslation, schemas: [`test${i + 1}`] });
            }
            // First pattern should be evicted (LRU)
            expect(PatternCache.get(patterns[0])).toBeNull();
            expect(PatternCache.get(patterns[1])).not.toBeNull();
            expect(PatternCache.get(patterns[2])).not.toBeNull();
            expect(PatternCache.get(patterns[3])).not.toBeNull();
        });
        test('should update LRU order on cache access', () => {
            PatternCache.configure({
                max_entries: 3,
                default_ttl_minutes: 30,
                enable_stats: true,
                memory_limit_mb: 50,
                cleanup_interval_minutes: 10
            });
            const patterns = [
                '/data/lru1/test*',
                '/data/lru2/test*',
                '/data/lru3/test*'
            ];
            const baseTranslation = {
                schemas: ['lru'],
                filter: { where: { id: { $like: 'test%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            // Cache all three patterns
            patterns.forEach((pattern, index) => {
                PatternCache.cachePattern(pattern, { ...baseTranslation, schemas: [`lru${index + 1}`] });
            });
            // Access first pattern to make it most recently used
            PatternCache.get(patterns[0]);
            // Add fourth pattern
            const fourthPattern = '/data/lru4/test*';
            PatternCache.cachePattern(fourthPattern, { ...baseTranslation, schemas: ['lru4'] });
            // Second pattern (least recently used) should be evicted
            expect(PatternCache.get(patterns[0])).not.toBeNull(); // Recently accessed
            expect(PatternCache.get(patterns[1])).toBeNull(); // Should be evicted
            expect(PatternCache.get(patterns[2])).not.toBeNull();
            expect(PatternCache.get(fourthPattern)).not.toBeNull();
        });
    });
    describe('Performance Statistics', () => {
        test('should track hit and miss statistics', () => {
            const pattern1 = '/data/stats/hit*';
            const pattern2 = '/data/stats/miss*';
            const translation = {
                schemas: ['stats'],
                filter: { where: { id: { $like: 'hit%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            PatternCache.cachePattern(pattern1, translation);
            // Generate hits and misses
            PatternCache.get(pattern1); // Hit
            PatternCache.get(pattern1); // Hit
            PatternCache.get(pattern2); // Miss
            PatternCache.get(pattern2); // Miss
            const stats = PatternCache.getStats();
            expect(stats.hit_count).toBe(2);
            expect(stats.miss_count).toBe(2);
            expect(stats.hit_rate).toBe(50); // 50%
        });
        test('should provide comprehensive cache statistics', () => {
            const patterns = [
                '/data/stat1/test*',
                '/data/stat2/test*',
                '/data/stat3/test*'
            ];
            const baseTranslation = {
                schemas: ['stats'],
                filter: { where: { id: { $like: 'test%' } } },
                cross_schema: false,
                complexity: 'complex',
                optimization_applied: ['test_optimization'],
                estimated_cost: 25
            };
            patterns.forEach((pattern, index) => {
                PatternCache.cachePattern(pattern, { ...baseTranslation, schemas: [`stat${index + 1}`] });
            });
            // Generate some hits
            PatternCache.get(patterns[0]);
            PatternCache.get(patterns[0]);
            PatternCache.get(patterns[1]);
            const stats = PatternCache.getStats();
            expect(stats.total_entries).toBe(3);
            expect(stats.hit_count).toBe(3);
            expect(stats.miss_count).toBe(0);
            expect(stats.hit_rate).toBe(100);
            expect(stats.memory_usage_bytes).toBeGreaterThan(0);
            expect(stats.oldest_entry).toBeInstanceOf(Date);
            expect(stats.most_recent_entry).toBeInstanceOf(Date);
            expect(stats.top_patterns).toBeDefined();
            expect(stats.top_patterns[0].hit_count).toBe(2); // Most accessed pattern
        });
        test('should track pattern usage statistics', () => {
            const pattern = '/data/usage/frequently-accessed*';
            const translation = {
                schemas: ['usage'],
                filter: { where: { id: { $like: 'frequently-accessed%' } } },
                cross_schema: false,
                complexity: 'complex',
                optimization_applied: ['usage_optimization'],
                estimated_cost: 30
            };
            PatternCache.cachePattern(pattern, translation);
            // Access multiple times
            for (let i = 0; i < 5; i++) {
                PatternCache.get(pattern);
            }
            const stats = PatternCache.getStats();
            const topPattern = stats.top_patterns[0];
            expect(topPattern.pattern).toBe(pattern);
            expect(topPattern.hit_count).toBe(5);
            expect(topPattern.estimated_savings_ms).toBeGreaterThan(0);
            expect(topPattern.last_used).toBeInstanceOf(Date);
        });
    });
    describe('Configuration and Customization', () => {
        test('should apply custom configuration', () => {
            const customConfig = {
                max_entries: 500,
                default_ttl_minutes: 60,
                enable_stats: false,
                memory_limit_mb: 100,
                cleanup_interval_minutes: 5
            };
            PatternCache.configure(customConfig);
            // Test that configuration is applied (indirectly through behavior)
            const pattern = '/data/config/test*';
            const translation = {
                schemas: ['config'],
                filter: { where: { id: { $like: 'test%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            PatternCache.cachePattern(pattern, translation);
            expect(PatternCache.get(pattern)).not.toBeNull();
        });
        test('should handle partial configuration updates', () => {
            // Only update max_entries
            PatternCache.configure({ max_entries: 100 });
            const pattern = '/data/partial/config*';
            const translation = {
                schemas: ['partial'],
                filter: { where: { id: { $like: 'config%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            PatternCache.cachePattern(pattern, translation);
            expect(PatternCache.get(pattern)).not.toBeNull();
        });
    });
    describe('Edge Cases and Error Handling', () => {
        test('should handle empty pattern strings', () => {
            const emptyPattern = '';
            const translation = {
                schemas: ['empty'],
                filter: {},
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 1
            };
            PatternCache.cachePattern(emptyPattern, translation);
            expect(PatternCache.get(emptyPattern)).not.toBeNull();
        });
        test('should handle very long pattern strings', () => {
            const longPattern = '/data/long/' + 'x'.repeat(10000) + '*';
            const translation = {
                schemas: ['long'],
                filter: { where: { id: { $like: 'x'.repeat(10000) + '%' } } },
                cross_schema: false,
                complexity: 'complex',
                optimization_applied: [],
                estimated_cost: 50
            };
            PatternCache.cachePattern(longPattern, translation);
            expect(PatternCache.get(longPattern)).not.toBeNull();
        });
        test('should handle patterns with special characters', () => {
            const specialPattern = "/data/special/user'with\"quotes&symbols*";
            const translation = {
                schemas: ['special'],
                filter: { where: { id: { $like: "user'with\"quotes&symbols%" } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 15
            };
            PatternCache.cachePattern(specialPattern, translation);
            expect(PatternCache.get(specialPattern)).not.toBeNull();
        });
        test('should handle cache operations when stats are disabled', () => {
            PatternCache.configure({ enable_stats: false });
            const pattern = '/data/no-stats/test*';
            const translation = {
                schemas: ['no-stats'],
                filter: { where: { id: { $like: 'test%' } } },
                cross_schema: false,
                complexity: 'simple',
                optimization_applied: [],
                estimated_cost: 10
            };
            PatternCache.cachePattern(pattern, translation);
            PatternCache.get(pattern);
            // Should not crash when getting stats
            const stats = PatternCache.getStats();
            expect(stats).toBeDefined();
        });
    });
});
//# sourceMappingURL=pattern-cache.test.js.map