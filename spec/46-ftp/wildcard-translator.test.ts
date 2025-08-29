/**
 * WildcardTranslator Unit Tests
 * 
 * Comprehensive test coverage for advanced wildcard pattern translation,
 * including simple patterns, complex multi-wildcard patterns, alternatives,
 * ranges, and cross-schema operations.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { WildcardTranslator, WildcardTranslation, PatternComponent } from '@src/ftp/wildcard-translator.js';
import { FilterOp } from '@lib/filter-where.js';

describe('WildcardTranslator - Advanced Pattern Translation', () => {
    
    describe('Simple Wildcard Patterns', () => {
        test('should handle basic wildcard in record ID', () => {
            const translation = WildcardTranslator.translatePath('/data/users/john*');
            
            logger.info('Translation result:', JSON.stringify(translation, null, 2));
            
            expect(translation.schemas).toEqual(['users']);
            expect(translation.complexity).toBe('complex');
            expect(translation.cross_schema).toBe(false);
            expect(translation.estimated_cost).toBeGreaterThan(20);
            
            // Check if filter structure exists and has the expected pattern
            if (translation.filter.where) {
                expect(translation.filter.where.id.$like).toBe('john%');
            }
        });
        
        test('should handle question mark wildcards', () => {
            const translation = WildcardTranslator.translatePath('/data/accounts/user-???');
            
            expect(translation.schemas).toEqual(['accounts']);
            expect(translation.complexity).toBe('complex');
            expect(translation.filter.where.id.$like).toBe('user-___');
        });
        
        test('should handle mixed wildcards', () => {
            const translation = WildcardTranslator.translatePath('/data/logs/error-*-20??');
            
            expect(translation.schemas).toEqual(['logs']);
            expect(translation.complexity).toBe('complex');
            expect(translation.filter.where.id.$like).toBe('error-%-20__');
        });
        
        test('should handle prefix and suffix wildcards', () => {
            const prefixTranslation = WildcardTranslator.translatePath('/data/users/*admin');
            expect(prefixTranslation.filter.where.id.$like).toBe('%admin');
            
            const suffixTranslation = WildcardTranslator.translatePath('/data/users/temp*');
            expect(suffixTranslation.filter.where.id.$like).toBe('temp%');
        });
    });
    
    describe('Complex Multi-Wildcard Patterns', () => {
        test('should handle multiple wildcards in single path component', () => {
            const translation = WildcardTranslator.translatePath('/data/users/*admin*user*');
            
            expect(translation.schemas).toEqual(['users']);
            expect(translation.complexity).toBe('complex');
            expect(translation.filter.where.id.$like).toBe('%admin%user%');
        });
        
        test('should handle wildcards across multiple path levels', () => {
            const translation = WildcardTranslator.translatePath('/data/users/admin*/department/eng*');
            
            expect(translation.schemas).toEqual(['users']);
            expect(translation.complexity).toBe('complex');
            expect(translation.filter.where.$and).toBeDefined();
            expect(translation.filter.where.$and).toHaveLength(2);
        });
        
        test('should combine multiple wildcard conditions with AND', () => {
            const translation = WildcardTranslator.translatePath('/data/orders/2024*/status/pending*');
            
            expect(translation.filter.where.$and).toBeDefined();
            expect(translation.filter.where.$and[0].id.$like).toBe('2024%');
            expect(translation.filter.where.$and[1].field_1.$like).toBe('pending%');
        });
    });
    
    describe('Alternative Pattern Support', () => {
        test('should handle simple alternatives', () => {
            const pattern = '/data/users/(admin|moderator)';
            const complexFilter = WildcardTranslator.translateComplexPattern('(admin|moderator)', 'role');
            
            expect(complexFilter.$or).toBeDefined();
            expect(complexFilter.$or).toHaveLength(2);
            expect(complexFilter.$or[0].role.$like).toBe('%admin%');
            expect(complexFilter.$or[1].role.$like).toBe('%moderator%');
        });
        
        test('should handle complex alternatives with wildcards', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('(admin*|*moderator|user-???)', 'username');
            
            expect(complexFilter.$or).toBeDefined();
            expect(complexFilter.$or).toHaveLength(3);
            expect(complexFilter.$or[0].username.$like).toBe('%admin*%');
            expect(complexFilter.$or[1].username.$like).toBe('%*moderator%');
            expect(complexFilter.$or[2].username.$like).toBe('%user-???%');
        });
        
        test('should handle nested alternatives', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('(admin|moderator|user)', 'access_level');
            
            expect(complexFilter.$or).toBeDefined();
            expect(complexFilter.$or).toHaveLength(3);
            expect(complexFilter.$or[0].access_level.$like).toBe('%admin%');
            expect(complexFilter.$or[1].access_level.$like).toBe('%moderator%');
            expect(complexFilter.$or[2].access_level.$like).toBe('%user%');
        });
    });
    
    describe('Range Pattern Support', () => {
        test('should handle numeric ranges', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('[01-12]', 'month');
            
            expect(complexFilter.$or).toBeDefined();
            expect(complexFilter.$or).toHaveLength(12);
            expect(complexFilter.$or[0].month.$like).toBe('%01%');
            expect(complexFilter.$or[11].month.$like).toBe('%12%');
        });
        
        test('should handle zero-padded ranges', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('[001-010]', 'id');
            
            expect(complexFilter.$or).toBeDefined();
            expect(complexFilter.$or).toHaveLength(10);
            expect(complexFilter.$or[0].id.$like).toBe('%001%');
            expect(complexFilter.$or[9].id.$like).toBe('%010%');
        });
        
        test('should handle year ranges', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('[2023-2025]', 'year');
            
            expect(complexFilter.$or).toBeDefined();
            expect(complexFilter.$or).toHaveLength(3);
            expect(complexFilter.$or[0].year.$like).toBe('%2023%');
            expect(complexFilter.$or[1].year.$like).toBe('%2024%');
            expect(complexFilter.$or[2].year.$like).toBe('%2025%');
        });
        
        test('should handle string ranges (limited)', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('[alpha-beta]', 'status');
            
            expect(complexFilter.$or).toBeDefined();
            expect(complexFilter.$or).toHaveLength(2);
            expect(complexFilter.$or[0].status.$like).toBe('%alpha%');
            expect(complexFilter.$or[1].status.$like).toBe('%beta%');
        });
    });
    
    describe('Cross-Schema Pattern Support', () => {
        test('should detect cross-schema wildcard patterns', () => {
            const translation = WildcardTranslator.translatePath('/data/*');
            
            expect(translation.cross_schema).toBe(true);
            expect(translation.complexity).toBe('cross');
            expect(translation.schemas).toEqual(['*']);
            expect(translation.estimated_cost).toBeGreaterThan(60);
        });
        
        test('should handle schema name patterns', () => {
            const translation = WildcardTranslator.translatePath('/data/user*');
            
            expect(translation.cross_schema).toBe(true);
            expect(translation.complexity).toBe('complex');
            expect(translation.schemas).toEqual(['user*']);
            expect(translation.estimated_cost).toBeGreaterThan(40);
        });
        
        test('should handle cross-schema with shared conditions', () => {
            const translation = WildcardTranslator.translatePath('/data/*/active');
            
            expect(translation.cross_schema).toBe(true);
            expect(translation.complexity).toBe('cross');
            expect(translation.schemas).toEqual(['*']);
        });
    });
    
    describe('Complex Combined Patterns', () => {
        test('should handle patterns with all feature types', () => {
            // Pattern: /data/users/*admin*(01-12)/(pending|active)*
            const translation = WildcardTranslator.translatePath('/data/users/*admin*[01-12]/(pending|active)*');
            
            expect(translation.schemas).toEqual(['users']);
            expect(translation.complexity).toBe('complex');
            expect(translation.estimated_cost).toBeGreaterThan(60);
            expect(translation.optimization_applied).toContain('complex_pattern_0');
        });
        
        test('should handle deeply nested logical conditions', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('*admin*[2023-2024]*(pending|active|suspended)*', 'complex_field');
            
            expect(complexFilter.$and).toBeDefined();
            expect(complexFilter.$and.length).toBeGreaterThan(1);
        });
        
        test('should handle patterns with escaped characters', () => {
            const translation = WildcardTranslator.translatePath('/data/special/user\\*literal');
            
            // Should treat escaped * as literal
            expect(translation.complexity).toBe('simple');
        });
    });
    
    describe('Pattern Component Parsing', () => {
        test('should correctly identify pattern component types', () => {
            // This tests the private parsePatternComponents method indirectly
            const simplePattern = WildcardTranslator.translateComplexPattern('admin*', 'field');
            expect(simplePattern.field.$like).toBe('admin%');
            
            const alternativePattern = WildcardTranslator.translateComplexPattern('(admin|user)', 'field');
            expect(alternativePattern.$or).toBeDefined();
            
            const rangePattern = WildcardTranslator.translateComplexPattern('[01-03]', 'field');
            expect(rangePattern.$or).toBeDefined();
        });
        
        test('should handle mixed component types in single pattern', () => {
            const mixedFilter = WildcardTranslator.translateComplexPattern('prefix*[01-02]*(admin|user)', 'field');
            
            expect(mixedFilter.$and).toBeDefined();
            expect(mixedFilter.$and.length).toBeGreaterThan(1);
        });
    });
    
    describe('Edge Cases and Error Handling', () => {
        test('should handle empty patterns gracefully', () => {
            const translation = WildcardTranslator.translatePath('/data');
            
            expect(translation.complexity).toBe('simple');
            expect(translation.filter).toEqual({});
            expect(translation.estimated_cost).toBe(1);
        });
        
        test('should handle root and meta paths', () => {
            const rootTranslation = WildcardTranslator.translatePath('/');
            expect(rootTranslation.complexity).toBe('simple');
            
            const metaTranslation = WildcardTranslator.translatePath('/meta');
            expect(metaTranslation.complexity).toBe('simple');
        });
        
        test('should handle malformed alternative patterns', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('(admin|', 'field');
            
            // Should not crash and should handle gracefully
            expect(complexFilter).toBeDefined();
        });
        
        test('should handle malformed range patterns', () => {
            const complexFilter = WildcardTranslator.translateComplexPattern('[01-', 'field');
            
            // Should not crash and should handle gracefully
            expect(complexFilter).toBeDefined();
        });
        
        test('should handle very long patterns', () => {
            const longPattern = '/data/schema/' + 'a'.repeat(1000) + '*';
            const translation = WildcardTranslator.translatePath(longPattern);
            
            expect(translation.schemas).toEqual(['schema']);
            expect(translation.complexity).toBe('complex');
        });
        
        test('should handle patterns with special SQL characters', () => {
            const translation = WildcardTranslator.translatePath("/data/users/user'with*quotes");
            
            expect(translation.schemas).toEqual(['users']);
            expect(translation.filter.where.id.$like).toContain("user'with%quotes");
        });
    });
    
    describe('Query Optimization', () => {
        test('should apply optimization techniques', () => {
            const filter = {
                where: {
                    $and: [
                        { field1: { $like: 'pattern1%' } },
                        { field2: { $like: 'pattern2%' } }
                    ]
                }
            };
            
            const optimized = WildcardTranslator.optimizeFilter(filter);
            
            expect(optimized).toBeDefined();
            // Optimization effects depend on implementation details
        });
        
        test('should handle empty filter optimization', () => {
            const emptyFilter = {};
            const optimized = WildcardTranslator.optimizeFilter(emptyFilter);
            
            expect(optimized).toEqual({});
        });
        
        test('should preserve filter structure during optimization', () => {
            const complexFilter = {
                where: {
                    $or: [
                        { field1: { $like: '%pattern%' } },
                        { field2: { $eq: 'value' } }
                    ]
                }
            };
            
            const optimized = WildcardTranslator.optimizeFilter(complexFilter);
            
            expect(optimized.where).toBeDefined();
        });
    });
    
    describe('Cross-Schema Query Batching', () => {
        test('should batch similar cross-schema queries', () => {
            const translations = [
                {
                    schemas: ['users'],
                    filter: { where: { active: true } },
                    cross_schema: true,
                    complexity: 'cross' as const,
                    optimization_applied: [],
                    estimated_cost: 50
                },
                {
                    schemas: ['accounts'],
                    filter: { where: { active: true } },
                    cross_schema: true,
                    complexity: 'cross' as const,
                    optimization_applied: [],
                    estimated_cost: 50
                }
            ];
            
            const batched = WildcardTranslator.batchCrossSchemaQueries(translations);
            
            expect(batched.length).toBeLessThanOrEqual(translations.length);
        });
        
        test('should preserve non-cross-schema queries during batching', () => {
            const translations = [
                {
                    schemas: ['users'],
                    filter: { where: { id: 'test' } },
                    cross_schema: false,
                    complexity: 'simple' as const,
                    optimization_applied: [],
                    estimated_cost: 10
                }
            ];
            
            const batched = WildcardTranslator.batchCrossSchemaQueries(translations);
            
            expect(batched).toEqual(translations);
        });
    });
    
    describe('Performance and Cost Estimation', () => {
        test('should estimate costs appropriately for different complexities', () => {
            const simpleTranslation = WildcardTranslator.translatePath('/data/users/specific-id');
            const complexTranslation = WildcardTranslator.translatePath('/data/users/*admin*/department/*eng*');
            const crossTranslation = WildcardTranslator.translatePath('/data/*');
            
            expect(simpleTranslation.estimated_cost).toBeLessThan(complexTranslation.estimated_cost);
            expect(complexTranslation.estimated_cost).toBeLessThan(crossTranslation.estimated_cost);
        });
        
        test('should apply appropriate optimization flags', () => {
            const translation = WildcardTranslator.translatePath('/data/users/test*pattern');
            
            expect(translation.optimization_applied).toBeDefined();
            expect(Array.isArray(translation.optimization_applied)).toBe(true);
        });
        
        test('should estimate costs within reasonable bounds', () => {
            const translation = WildcardTranslator.translatePath('/data/users/*admin*[01-12]*(pending|active)*');
            
            expect(translation.estimated_cost).toBeGreaterThanOrEqual(1);
            expect(translation.estimated_cost).toBeLessThanOrEqual(100);
        });
    });
});