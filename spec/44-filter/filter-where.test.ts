/**
 * FilterWhere Unit Tests
 * 
 * Tests schema-independent WHERE clause generation with proper parameterization
 * Validates Issue #113 implementation
 */

import { describe, test, expect } from 'vitest';
import { FilterWhere } from '@lib/filter-where.js';

describe('FilterWhere', () => {
  describe('Basic WHERE clause generation', () => {
    test('should generate simple equality condition', () => {
      const { whereClause, params } = FilterWhere.generate({ name: 'John' });
      
      expect(whereClause).toContain('"name" = $1');
      expect(whereClause).toContain('"trashed_at" IS NULL');
      expect(whereClause).toContain('"deleted_at" IS NULL');
      expect(params).toEqual(['John']);
    });

    test('should generate multiple conditions', () => {
      const { whereClause, params } = FilterWhere.generate({ 
        name: 'John', 
        age: 25 
      });
      
      expect(whereClause).toContain('"name" = $1');
      expect(whereClause).toContain('"age" = $2');
      expect(params).toEqual(['John', 25]);
    });

    test('should handle null values correctly', () => {
      const { whereClause, params } = FilterWhere.generate({ 
        name: 'John',
        deleted_reason: null 
      });
      
      expect(whereClause).toContain('"name" = $1');
      expect(whereClause).toContain('"deleted_reason" IS NULL');
      expect(params).toEqual(['John']);
    });
  });

  describe('Operator handling', () => {
    test('should generate comparison operators', () => {
      const { whereClause, params } = FilterWhere.generate({
        age: { $gt: 18, $lt: 65 },
        score: { $gte: 80 }
      });
      
      expect(whereClause).toContain('"age" > $1');
      expect(whereClause).toContain('"age" < $2');
      expect(whereClause).toContain('"score" >= $3');
      expect(params).toEqual([18, 65, 80]);
    });

    test('should generate IN operations', () => {
      const { whereClause, params } = FilterWhere.generate({
        status: ['active', 'pending'],
        priority: { $in: [1, 2, 3] }
      });
      
      expect(whereClause).toContain('"status" IN ($1, $2)');
      expect(whereClause).toContain('"priority" IN ($3, $4, $5)');
      expect(params).toEqual(['active', 'pending', 1, 2, 3]);
    });

    test('should generate LIKE operations', () => {
      const { whereClause, params } = FilterWhere.generate({
        name: { $like: 'John%' },
        email: { $ilike: '%@gmail.com' }
      });
      
      expect(whereClause).toContain('"name" LIKE $1');
      expect(whereClause).toContain('"email" ILIKE $2');
      expect(params).toEqual(['John%', '%@gmail.com']);
    });
  });

  describe('Parameter index offsetting', () => {
    test('should support starting parameter index', () => {
      const { whereClause, params } = FilterWhere.generate(
        { name: 'John', age: 25 },
        5  // Start at parameter index 5
      );
      
      expect(whereClause).toContain('"name" = $6');  // 5 + 1
      expect(whereClause).toContain('"age" = $7');   // 5 + 2
      expect(params).toEqual(['John', 25]);
    });

    test('should work with complex queries (SET + WHERE)', () => {
      // Simulate UPDATE query: SET field1 = $1, field2 = $2 WHERE id = $3
      const { whereClause, params } = FilterWhere.generate(
        { id: 'record-123' },
        2  // Start after 2 SET parameters
      );
      
      expect(whereClause).toContain('"id" = $3');  // Parameter $3 after SET $1, $2
      expect(params).toEqual(['record-123']);
    });
  });

  describe('Soft delete handling', () => {
    test('should include trashed_at and deleted_at filters by default', () => {
      const { whereClause, params } = FilterWhere.generate({ name: 'John' });
      
      expect(whereClause).toContain('"trashed_at" IS NULL');
      expect(whereClause).toContain('"deleted_at" IS NULL');
    });

    test('should allow including trashed records', () => {
      const { whereClause, params } = FilterWhere.generate(
        { name: 'John' },
        0,
        { includeTrashed: true }
      );
      
      expect(whereClause).not.toContain('"trashed_at" IS NULL');
      expect(whereClause).toContain('"deleted_at" IS NULL');
    });

    test('should allow including deleted records', () => {
      const { whereClause, params } = FilterWhere.generate(
        { name: 'John' },
        0,
        { includeDeleted: true }
      );
      
      expect(whereClause).toContain('"trashed_at" IS NULL');
      expect(whereClause).not.toContain('"deleted_at" IS NULL');
    });

    test('should allow including both trashed and deleted', () => {
      const { whereClause, params } = FilterWhere.generate(
        { name: 'John' },
        0,
        { includeTrashed: true, includeDeleted: true }
      );
      
      expect(whereClause).not.toContain('"trashed_at" IS NULL');
      expect(whereClause).not.toContain('"deleted_at" IS NULL');
      expect(whereClause).toContain('"name" = $1');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty conditions', () => {
      const { whereClause, params } = FilterWhere.generate({});
      
      expect(whereClause).toBe('"trashed_at" IS NULL AND "deleted_at" IS NULL');
      expect(params).toEqual([]);
    });

    test('should handle no conditions with all options', () => {
      const { whereClause, params } = FilterWhere.generate(
        {},
        0,
        { includeTrashed: true, includeDeleted: true }
      );
      
      expect(whereClause).toBe('1=1');  // No conditions = always true
      expect(params).toEqual([]);
    });

    test('should handle empty arrays in IN operations', () => {
      const { whereClause, params } = FilterWhere.generate({
        status: { $in: [] }  // Empty array
      });
      
      expect(whereClause).toContain('1=0');  // Empty IN = always false
      expect(params).toEqual([]);
    });
  });
});