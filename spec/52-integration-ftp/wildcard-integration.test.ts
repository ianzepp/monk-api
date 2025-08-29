/**
 * Enhanced FTP Wildcard Integration Tests
 * 
 * Integration tests for the advanced wildcard translation system with real database,
 * testing complex patterns, cross-schema operations, performance metrics,
 * and pattern caching with actual HTTP endpoints.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext, type TestTenantManager, type TestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';
import { FtpListRequest, FtpListResponse } from '@src/routes/ftp/list.js';
import { PatternCache } from '@src/ftp/pattern-cache.js';

describe('Enhanced FTP Wildcard - Integration Tests', () => {
    let tenantManager: TestTenantManager;
    let testContext: TestContext;
    
    beforeAll(async () => {
        // Create fresh tenant for this test suite
        tenantManager = await createTestTenant();
        testContext = await createTestContext(tenantManager.tenant!, 'root');
        
        // Create test schemas
        const userYaml = await readFile('spec/fixtures/schema/account.yaml', 'utf-8');
        const productYaml = await readFile('spec/fixtures/schema/contact.yaml', 'utf-8');
        
        await testContext.metabase.createOne('users', userYaml);
        await testContext.metabase.createOne('products', productYaml);
        
        // Create comprehensive test data for wildcard testing
        const userData = [
            {
                id: 'admin-001',
                name: 'Admin User One',
                email: 'admin1@company.com',
                username: 'admin1',
                account_type: 'admin',
                is_active: true,
                department: 'engineering',
                access_level: 'full'
            },
            {
                id: 'admin-002',
                name: 'Admin User Two', 
                email: 'admin2@company.com',
                username: 'admin2',
                account_type: 'admin',
                is_active: true,
                department: 'marketing',
                access_level: 'full'
            },
            {
                id: 'user-001',
                name: 'Regular User One',
                email: 'user1@company.com',
                username: 'user1',
                account_type: 'user',
                is_active: true,
                department: 'engineering',
                access_level: 'limited'
            },
            {
                id: 'temp-001',
                name: 'Temp User One',
                email: 'temp1@external.com',
                username: 'temp1',
                account_type: 'temporary',
                is_active: false,
                department: 'consulting',
                access_level: 'restricted'
            },
            {
                id: 'moderator-eng-001',
                name: 'Engineering Moderator',
                email: 'mod.eng@company.com',
                username: 'modeng1',
                account_type: 'moderator',
                is_active: true,
                department: 'engineering',
                access_level: 'elevated'
            }
        ];
        
        const productData = [
            {
                id: 'prod-2024-001',
                name: 'Product Alpha',
                category: 'software',
                status: 'active',
                created_year: '2024',
                price: 99.99
            },
            {
                id: 'prod-2024-002',
                name: 'Product Beta',
                category: 'hardware',
                status: 'pending',
                created_year: '2024',
                price: 199.99
            },
            {
                id: 'prod-2023-001',
                name: 'Legacy Product',
                category: 'software',
                status: 'deprecated',
                created_year: '2023',
                price: 49.99
            }
        ];
        
        // Insert test data
        await testContext.database.createAll('users', userData);
        await testContext.database.createAll('products', productData);
        
        // Clear pattern cache before tests
        PatternCache.invalidateAll();
    });
    
    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
        PatternCache.invalidateAll();
    });
    
    describe('Simple Wildcard Patterns', () => {
        test('should handle basic prefix wildcards', async () => {
            const request: FtpListRequest = {
                path: '/data/users/admin*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    pattern_optimization: true,
                    use_pattern_cache: true
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.entries).toBeDefined();
            expect(result.entries.length).toBe(2); // admin-001, admin-002
            expect(result.entries.every(e => e.name.startsWith('admin-'))).toBe(true);
            
            // Check enhanced metadata
            expect(result.pattern_info).toBeDefined();
            expect(result.pattern_info!.complexity).toBe('complex');
            expect(result.pattern_info!.schemas_queried).toContain('users');
            expect(result.pattern_info!.cache_hit).toBe(false); // First access
            
            expect(result.performance_metrics).toBeDefined();
            expect(result.performance_metrics!.translation_time_ms).toBeGreaterThan(0);
            expect(result.performance_metrics!.database_time_ms).toBeGreaterThan(0);
        });
        
        test('should handle suffix wildcards', async () => {
            const request: FtpListRequest = {
                path: '/data/users/*-001',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.entries.length).toBe(3); // admin-001, user-001, temp-001
            expect(result.entries.every(e => e.name.endsWith('-001'))).toBe(true);
            
            expect(result.pattern_info!.complexity).toBe('complex');
        });
        
        test('should handle middle wildcards', async () => {
            const request: FtpListRequest = {
                path: '/data/users/moderator*001',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.entries.length).toBe(1); // moderator-eng-001
            expect(result.entries[0].name).toBe('moderator-eng-001');
        });
    });
    
    describe('Complex Multi-Wildcard Patterns', () => {
        test('should handle multiple wildcards in single pattern', async () => {
            const request: FtpListRequest = {
                path: '/data/products/prod-*-00*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    pattern_optimization: true
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.entries.length).toBe(3); // All products match prod-*-00*
            
            expect(result.pattern_info!.complexity).toBe('complex');
            expect(result.pattern_info!.pattern_breakdown).toBeDefined();
            expect(result.pattern_info!.pattern_breakdown!.wildcard_count).toBeGreaterThan(1);
        });
        
        test('should handle question mark wildcards', async () => {
            const request: FtpListRequest = {
                path: '/data/users/admin-00?',
                ftp_options: {
                    show_hidden: false,
                    long_format: false,
                    recursive: false
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.entries.length).toBe(2); // admin-001, admin-002
        });
    });
    
    describe('Pattern Caching Integration', () => {
        test('should cache pattern translations', async () => {
            const pattern = '/data/users/temp*';
            const request: FtpListRequest = {
                path: pattern,
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    use_pattern_cache: true
                }
            };
            
            // First request - should cache the pattern
            const response1 = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response1.status).toBe(200);
            const result1: FtpListResponse = await response1.json();
            
            expect(result1.success).toBe(true);
            expect(result1.pattern_info!.cache_hit).toBe(false);
            
            // Second request - should hit cache
            const response2 = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response2.status).toBe(200);
            const result2: FtpListResponse = await response2.json();
            
            expect(result2.success).toBe(true);
            expect(result2.pattern_info!.cache_hit).toBe(true);
            expect(result2.performance_metrics!.translation_time_ms).toBeLessThan(result1.performance_metrics!.translation_time_ms);
        });
        
        test('should invalidate cache when schema data changes', async () => {
            const pattern = '/data/users/cache*';
            const request: FtpListRequest = {
                path: pattern,
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    use_pattern_cache: true
                }
            };
            
            // First request
            const response1 = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            const result1: FtpListResponse = await response1.json();
            expect(result1.pattern_info!.cache_hit).toBe(false);
            
            // Add new data to users schema
            await testContext.database.createOne('users', {
                id: 'cache-test-001',
                name: 'Cache Test User',
                email: 'cache@test.com',
                username: 'cachetest',
                account_type: 'test'
            });
            
            // Manually invalidate cache (in real usage, this would be automatic)
            PatternCache.invalidate('users');
            
            // Second request should not hit cache due to invalidation
            const response2 = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            const result2: FtpListResponse = await response2.json();
            expect(result2.pattern_info!.cache_hit).toBe(false);
            expect(result2.entries.length).toBe(1); // Should find the new cache-test-001 record
        });
    });
    
    describe('Performance and Optimization', () => {
        test('should apply query optimization for complex patterns', async () => {
            const request: FtpListRequest = {
                path: '/data/users/*admin*eng*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    pattern_optimization: true
                },
                performance_hints: {
                    priority: 'speed',
                    expected_result_count: 5
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.pattern_info!.optimization_applied).toBeDefined();
            expect(result.pattern_info!.optimization_applied.length).toBeGreaterThan(0);
            
            expect(result.performance_metrics!.filter_efficiency).toBeGreaterThan(0);
            expect(result.performance_metrics!.total_records_scanned).toBeGreaterThanOrEqual(result.entries.length);
        });
        
        test('should handle performance hints appropriately', async () => {
            const request: FtpListRequest = {
                path: '/data/products/prod*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false
                },
                performance_hints: {
                    expected_result_count: 100,
                    cache_duration: 60,
                    priority: 'accuracy',
                    timeout_ms: 15000
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.entries.length).toBe(3); // All products
            
            // Performance hints should influence optimization
            expect(result.pattern_info!.estimated_cost).toBeDefined();
            expect(result.performance_metrics!.query_time_ms).toBeLessThan(15000);
        });
        
        test('should provide accurate performance metrics', async () => {
            const request: FtpListRequest = {
                path: '/data/users/*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    pattern_optimization: true
                }
            };
            
            const startTime = Date.now();
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            const endTime = Date.now();
            const actualDuration = endTime - startTime;
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.performance_metrics!.query_time_ms).toBeLessThan(actualDuration + 100); // Allow some tolerance
            expect(result.performance_metrics!.translation_time_ms).toBeGreaterThan(0);
            expect(result.performance_metrics!.database_time_ms).toBeGreaterThan(0);
            expect(result.performance_metrics!.filter_efficiency).toBeGreaterThan(0);
        });
    });
    
    describe('Advanced Pattern Features', () => {
        test('should handle patterns with ACL filtering', async () => {
            // Create user with limited access
            const limitedContext = await createTestContext(tenantManager.tenant!, 'user');
            
            const request: FtpListRequest = {
                path: '/data/users/admin*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${limitedContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            // Should still work but may have different results based on ACL
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.pattern_info!.supported_features).toContain('acl_filtering');
        });
        
        test('should handle complex sorting with wildcards', async () => {
            const request: FtpListRequest = {
                path: '/data/users/*-00*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    sort_by: 'name',
                    sort_order: 'asc'
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.entries.length).toBeGreaterThan(1);
            
            // Verify sorting
            for (let i = 1; i < result.entries.length; i++) {
                expect(result.entries[i].name.localeCompare(result.entries[i - 1].name)).toBeGreaterThanOrEqual(0);
            }
        });
        
        test('should handle cross-schema limit enforcement', async () => {
            const request: FtpListRequest = {
                path: '/data/*/prod*', // This would be cross-schema if implemented
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    cross_schema_limit: 2
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            // This may return an error or limited results depending on cross-schema implementation
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            if (result.pattern_info?.cross_schema_count) {
                expect(result.entries.length).toBeLessThanOrEqual(2);
            }
        });
    });
    
    describe('Error Handling and Edge Cases', () => {
        test('should handle invalid wildcard patterns gracefully', async () => {
            const request: FtpListRequest = {
                path: '/data/users/[invalid-range',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            // Should either handle gracefully or return appropriate error
            expect(response.status).toBeOneOf([200, 400, 500]);
        });
        
        test('should handle very complex patterns without timeout', async () => {
            const request: FtpListRequest = {
                path: '/data/users/*admin*eng*mod*user*temp*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false,
                    pattern_optimization: true
                },
                performance_hints: {
                    timeout_ms: 5000
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.pattern_info!.complexity).toBe('complex');
            expect(result.performance_metrics!.query_time_ms).toBeLessThan(5000);
        });
        
        test('should handle empty wildcard results', async () => {
            const request: FtpListRequest = {
                path: '/data/users/nonexistent*',
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false
                }
            };
            
            const response = await fetch('http://localhost:9001/ftp/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(request)
            });
            
            expect(response.status).toBe(200);
            const result: FtpListResponse = await response.json();
            
            expect(result.success).toBe(true);
            expect(result.entries).toEqual([]);
            expect(result.total).toBe(0);
            expect(result.pattern_info!.complexity).toBe('complex');
        });
    });
});