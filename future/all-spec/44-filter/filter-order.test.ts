/**
 * FilterOrder Unit Tests
 * 
 * Tests schema-independent ORDER BY clause generation
 * Validates Issue #113 FilterOrder implementation
 */

import { describe, test, expect } from 'vitest';
import { FilterOrder } from '@src/lib/filter-order.js';

describe('FilterOrder', () => {
  describe('String format parsing', () => {
    test('should parse simple column name with default ascending', () => {
      const orderClause = FilterOrder.generate('name');
      
      expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    test('should parse column with explicit direction', () => {
      const orderClause = FilterOrder.generate('created_at desc');
      
      expect(orderClause).toBe('ORDER BY "created_at" DESC');
    });

    test('should handle case insensitive directions', () => {
      const orderClause1 = FilterOrder.generate('name ASC');
      const orderClause2 = FilterOrder.generate('name DESC');
      const orderClause3 = FilterOrder.generate('name descending');
      
      expect(orderClause1).toBe('ORDER BY "name" ASC');
      expect(orderClause2).toBe('ORDER BY "name" DESC');
      expect(orderClause3).toBe('ORDER BY "name" DESC');
    });

    test('should handle multiple whitespace', () => {
      const orderClause = FilterOrder.generate('  name   desc  ');
      
      expect(orderClause).toBe('ORDER BY "name" DESC');
    });
  });

  describe('Array format parsing', () => {
    test('should parse array of string orders', () => {
      const orderClause = FilterOrder.generate(['name asc', 'created_at desc']);
      
      expect(orderClause).toBe('ORDER BY "name" ASC, "created_at" DESC');
    });

    test('should parse array of object orders', () => {
      const orderClause = FilterOrder.generate([
        { column: 'priority', sort: 'desc' },
        { column: 'name', sort: 'asc' }
      ]);
      
      expect(orderClause).toBe('ORDER BY "priority" DESC, "name" ASC');
    });

    test('should parse mixed array formats', () => {
      const orderClause = FilterOrder.generate([
        'name asc',
        { column: 'created_at', sort: 'desc' }
      ]);
      
      expect(orderClause).toBe('ORDER BY "name" ASC, "created_at" DESC');
    });
  });

  describe('Object format parsing', () => {
    test('should parse object with column-direction mapping', () => {
      const orderClause = FilterOrder.generate({
        name: 'asc',
        created_at: 'desc',
        priority: 'asc'
      });
      
      expect(orderClause).toContain('"name" ASC');
      expect(orderClause).toContain('"created_at" DESC');
      expect(orderClause).toContain('"priority" ASC');
      expect(orderClause).toContain('ORDER BY');
    });
  });

  describe('Column name sanitization', () => {
    test('should sanitize column names to prevent injection', () => {
      const orderClause = FilterOrder.generate('name;DROP-TABLE_users');
      
      // Should strip dangerous characters, leaving only alphanumeric and underscore  
      expect(orderClause).toBe('ORDER BY "nameDROPTABLE_users" ASC');
    });

    test('should preserve valid column names', () => {
      const orderClause = FilterOrder.generate('user_account_created_at_timestamp');
      
      expect(orderClause).toBe('ORDER BY "user_account_created_at_timestamp" ASC');
    });

    test('should handle numeric column names', () => {
      const orderClause = FilterOrder.generate('column123');
      
      expect(orderClause).toBe('ORDER BY "column123" ASC');
    });
  });

  describe('Sort direction normalization', () => {
    test('should normalize various direction formats', () => {
      const testCases = [
        ['asc', 'ASC'],
        ['desc', 'DESC'], 
        ['ASC', 'ASC'],
        ['DESC', 'DESC'],
        ['ascending', 'ASC'],
        ['descending', 'DESC'],
        ['invalid', 'ASC']  // Invalid defaults to ASC
      ];

      testCases.forEach(([input, expected]) => {
        const orderClause = FilterOrder.generate(`name ${input}`);
        expect(orderClause).toBe(`ORDER BY "name" ${expected}`);
      });
    });
  });

  describe('Edge cases', () => {
    test('should handle empty input', () => {
      expect(FilterOrder.generate(null)).toBe('');
      expect(FilterOrder.generate(undefined)).toBe('');
      expect(FilterOrder.generate('')).toBe('');
    });

    test('should handle empty arrays', () => {
      const orderClause = FilterOrder.generate([]);
      
      expect(orderClause).toBe('');
    });

    test('should handle empty objects', () => {
      const orderClause = FilterOrder.generate({});
      
      expect(orderClause).toBe('');
    });

    test('should handle malformed string input', () => {
      const orderClause = FilterOrder.generate('   ');
      
      expect(orderClause).toBe('');
    });

    test('should handle array with invalid entries', () => {
      const orderClause = FilterOrder.generate([
        'name asc',
        null,
        { column: 'created_at', sort: 'desc' },
        undefined,
        ''
      ]);
      
      expect(orderClause).toBe('ORDER BY "name" ASC, "created_at" DESC');
    });
  });

  describe('Integration scenarios', () => {
    test('should work for common database ordering patterns', () => {
      // Most recent first, then by name
      const orderClause = FilterOrder.generate([
        { column: 'created_at', sort: 'desc' },
        { column: 'name', sort: 'asc' }
      ]);
      
      expect(orderClause).toBe('ORDER BY "created_at" DESC, "name" ASC');
    });

    test('should work for pagination scenarios', () => {
      // Consistent ordering for pagination
      const orderClause = FilterOrder.generate({
        id: 'asc'  // Stable sort key
      });
      
      expect(orderClause).toBe('ORDER BY "id" ASC');
    });

    test('should work for search result ranking', () => {
      // Score descending, then alphabetical
      const orderClause = FilterOrder.generate([
        'score desc',
        'name asc'
      ]);
      
      expect(orderClause).toBe('ORDER BY "score" DESC, "name" ASC');
    });
  });
});