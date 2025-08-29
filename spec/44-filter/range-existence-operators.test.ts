import { describe, test, expect } from 'vitest';
import { FilterWhere } from '@lib/filter-where.js';

describe('Range and Existence Operators - Comprehensive Testing', () => {
  
  describe('$between operator (Range Operations)', () => {
    test('numeric range', () => {
      const { whereClause, params } = FilterWhere.generate({
        age: { $between: [18, 65] }
      });
      
      expect(whereClause).toContain('"age" BETWEEN $1 AND $2');
      expect(params).toEqual([18, 65]);
    });

    test('decimal range', () => {
      const { whereClause, params } = FilterWhere.generate({
        price: { $between: [10.99, 999.99] }
      });
      
      expect(whereClause).toContain('"price" BETWEEN $1 AND $2');
      expect(params).toEqual([10.99, 999.99]);
    });

    test('date range', () => {
      const { whereClause, params } = FilterWhere.generate({
        created_at: { $between: ['2024-01-01', '2024-12-31'] }
      });
      
      expect(whereClause).toContain('"created_at" BETWEEN $1 AND $2');
      expect(params).toEqual(['2024-01-01', '2024-12-31']);
    });

    test('timestamp range', () => {
      const { whereClause, params } = FilterWhere.generate({
        updated_at: { $between: ['2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z'] }
      });
      
      expect(whereClause).toContain('"updated_at" BETWEEN $1 AND $2');
      expect(params).toEqual(['2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z']);
    });

    test('string range (alphabetical)', () => {
      const { whereClause, params } = FilterWhere.generate({
        name: { $between: ['Alice', 'Zara'] }
      });
      
      expect(whereClause).toContain('"name" BETWEEN $1 AND $2');
      expect(params).toEqual(['Alice', 'Zara']);
    });

    test('negative number range', () => {
      const { whereClause, params } = FilterWhere.generate({
        temperature: { $between: [-10, 40] }
      });
      
      expect(whereClause).toContain('"temperature" BETWEEN $1 AND $2');
      expect(params).toEqual([-10, 40]);
    });

    test('range with same min/max value', () => {
      const { whereClause, params } = FilterWhere.generate({
        exact_value: { $between: [42, 42] }
      });
      
      expect(whereClause).toContain('"exact_value" BETWEEN $1 AND $2');
      expect(params).toEqual([42, 42]);
    });

    test('invalid range - single value', () => {
      expect(() => {
        FilterWhere.generate({
          age: { $between: [18] }
        });
      }).toThrow('$between requires array with exactly 2 values: [min, max]');
    });

    test('invalid range - too many values', () => {
      expect(() => {
        FilterWhere.generate({
          age: { $between: [18, 25, 65] }
        });
      }).toThrow('$between requires array with exactly 2 values: [min, max]');
    });

    test('invalid range - non-array', () => {
      expect(() => {
        FilterWhere.generate({
          age: { $between: 25 }
        });
      }).toThrow('$between requires array with exactly 2 values: [min, max]');
    });

    test('range with null values', () => {
      expect(() => {
        FilterWhere.generate({
          field: { $between: [null, 100] }
        });
      }).toThrow('$between requires non-null values: [min, max]');
    });

    test('range combined with logical operators', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { age: { $between: [18, 65] } },
          { salary: { $between: [50000, 150000] } },
          {
            $or: [
              { experience: { $between: [2, 5] } },
              { education: 'advanced' }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"age" BETWEEN $1 AND $2');
      expect(whereClause).toContain('"salary" BETWEEN $3 AND $4');
      expect(whereClause).toContain('"experience" BETWEEN $5 AND $6');
      expect(whereClause).toContain('"education" = $7');
      expect(params).toEqual([18, 65, 50000, 150000, 2, 5, 'advanced']);
    });
  });

  describe('$exists operator (Field Existence)', () => {
    test('field exists - true', () => {
      const { whereClause, params } = FilterWhere.generate({
        optional_field: { $exists: true }
      });
      
      expect(whereClause).toContain('"optional_field" IS NOT NULL');
      expect(params).toEqual([]);
    });

    test('field does not exist - false', () => {
      const { whereClause, params } = FilterWhere.generate({
        temp_data: { $exists: false }
      });
      
      expect(whereClause).toContain('"temp_data" IS NULL');
      expect(params).toEqual([]);
    });

    test('multiple existence checks', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { required_field: { $exists: true } },
          { optional_field: { $exists: false } },
          { deprecated_field: { $exists: false } }
        ]
      });
      
      expect(whereClause).toContain('"required_field" IS NOT NULL');
      expect(whereClause).toContain('"optional_field" IS NULL');
      expect(whereClause).toContain('"deprecated_field" IS NULL');
      expect(params).toEqual([]);
    });

    test('existence with value checks', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { email: { $exists: true } },
          { email: { $like: '%@company.com' } }
        ]
      });
      
      expect(whereClause).toContain('"email" IS NOT NULL');
      expect(whereClause).toContain('"email" LIKE $1');
      expect(params).toEqual(['%@company.com']);
    });

    test('existence in logical context', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { primary_email: { $exists: true } },
          { backup_email: { $exists: true } },
          { phone: { $exists: true } }
        ]
      });
      
      expect(whereClause).toContain('("primary_email" IS NOT NULL OR "backup_email" IS NOT NULL OR "phone" IS NOT NULL)');
      expect(params).toEqual([]);
    });
  });

  describe('$null operator (Null Checking)', () => {
    test('field is null - true', () => {
      const { whereClause, params } = FilterWhere.generate({
        deleted_at: { $null: true }
      });
      
      expect(whereClause).toContain('"deleted_at" IS NULL');
      expect(params).toEqual([]);
    });

    test('field is not null - false', () => {
      const { whereClause, params } = FilterWhere.generate({
        required_field: { $null: false }
      });
      
      expect(whereClause).toContain('"required_field" IS NOT NULL');
      expect(params).toEqual([]);
    });

    test('null checks with other operators', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { deleted_at: { $null: true } },      // Not deleted
          { trashed_at: { $null: true } },      // Not trashed
          { verified_at: { $null: false } },    // Is verified
          { status: 'active' }
        ]
      });
      
      expect(whereClause).toContain('"deleted_at" IS NULL');
      expect(whereClause).toContain('"trashed_at" IS NULL');
      expect(whereClause).toContain('"verified_at" IS NOT NULL');
      expect(whereClause).toContain('"status" = $1');
      expect(params).toEqual(['active']);
    });

    test('null vs exists operator differences', () => {
      // $null: true === $exists: false
      const nullResult = FilterWhere.generate({
        field: { $null: true }
      });
      
      const existsResult = FilterWhere.generate({
        field: { $exists: false }
      });
      
      expect(nullResult.whereClause).toContain('"field" IS NULL');
      expect(existsResult.whereClause).toContain('"field" IS NULL');
      // Both should generate the same SQL
    });
  });

  describe('Range and Existence Combinations', () => {
    test('range with existence validation', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { birth_date: { $exists: true } },           // Has birth date
          { birth_date: { $between: ['1980-01-01', '2005-12-31'] } }, // In valid range
          { death_date: { $null: true } }              // Still alive
        ]
      });
      
      expect(whereClause).toContain('"birth_date" IS NOT NULL');
      expect(whereClause).toContain('"birth_date" BETWEEN $1 AND $2');
      expect(whereClause).toContain('"death_date" IS NULL');
      expect(params).toEqual(['1980-01-01', '2005-12-31']);
    });

    test('optional field with range fallback', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { priority: { $null: true } },               // No priority set (default)
          { priority: { $between: [1, 10] } }          // Or valid priority range
        ]
      });
      
      expect(whereClause).toContain('("priority" IS NULL OR "priority" BETWEEN $1 AND $2)');
      expect(params).toEqual([1, 10]);
    });

    test('complex field validation', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { user_id: { $exists: true } },
          { user_id: { $like: 'user-%' } },
          { created_at: { $between: ['2024-01-01', '2024-12-31'] } },
          { last_login: { $exists: true } },
          { 
            $or: [
              { status: 'active' },
              { premium_until: { $exists: true } }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"user_id" IS NOT NULL');
      expect(whereClause).toContain('"user_id" LIKE $1');
      expect(whereClause).toContain('"created_at" BETWEEN $2 AND $3');
      expect(whereClause).toContain('"last_login" IS NOT NULL');
      expect(whereClause).toContain('"status" = $4');
      expect(whereClause).toContain('"premium_until" IS NOT NULL');
      expect(params).toEqual(['user-%', '2024-01-01', '2024-12-31', 'active']);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('range boundary edge cases', () => {
      const { whereClause, params } = FilterWhere.generate({
        score: { $between: [0, 0] }
      });
      
      expect(whereClause).toContain('"score" BETWEEN $1 AND $2');
      expect(params).toEqual([0, 0]);
    });

    test('existence with boolean fields', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { verified: { $exists: true } },
          { verified: true }
        ]
      });
      
      expect(whereClause).toContain('"verified" IS NOT NULL');
      expect(whereClause).toContain('"verified" = $1');
      expect(params).toEqual([true]);
    });

    test('null checking with array fields', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { tags: { $null: false } },           // Has tags array
          { tags: { $size: { $gte: 1 } } }      // Array has elements
        ]
      });
      
      expect(whereClause).toContain('"tags" IS NOT NULL');
      expect(whereClause).toContain('array_length("tags", 1) >= $1');
      expect(params).toEqual([1]);
    });

    test('existence with date fields', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { created_at: { $exists: true } },
          { updated_at: { $exists: true } },
          { deleted_at: { $null: true } },      // Not deleted
          { created_at: { $between: ['2024-01-01', '2024-12-31'] } }
        ]
      });
      
      expect(whereClause).toContain('"created_at" IS NOT NULL');
      expect(whereClause).toContain('"updated_at" IS NOT NULL');
      expect(whereClause).toContain('"deleted_at" IS NULL');
      expect(whereClause).toContain('"created_at" BETWEEN $1 AND $2');
      expect(params).toEqual(['2024-01-01', '2024-12-31']);
    });
  });

  describe('Real-World Scenarios', () => {
    test('user age validation for content access', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { birth_date: { $exists: true } },
          { birth_date: { $between: ['1960-01-01', '2006-01-01'] } }, // 18-64 years old
          { age_verified: true },
          { parental_consent: { $null: true } }  // Not needed for adults
        ]
      });
      
      expect(whereClause).toContain('"birth_date" IS NOT NULL');
      expect(whereClause).toContain('"birth_date" BETWEEN $1 AND $2');
      expect(whereClause).toContain('"age_verified" = $3');
      expect(whereClause).toContain('"parental_consent" IS NULL');
      expect(params).toEqual(['1960-01-01', '2006-01-01', true]);
    });

    test('financial record validation', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { amount: { $exists: true } },
          { amount: { $between: [0.01, 999999.99] } },  // Valid monetary range
          { currency: { $exists: true } },
          { processed_at: { $null: false } },            // Has been processed
          { error_message: { $null: true } }             // No processing errors
        ]
      });
      
      expect(whereClause).toContain('"amount" IS NOT NULL');
      expect(whereClause).toContain('"amount" BETWEEN $1 AND $2');
      expect(whereClause).toContain('"currency" IS NOT NULL');
      expect(whereClause).toContain('"processed_at" IS NOT NULL');
      expect(whereClause).toContain('"error_message" IS NULL');
      expect(params).toEqual([0.01, 999999.99]);
    });

    test('time-based content filtering', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { published_at: { $exists: true } },                        // Is published
          { published_at: { $between: ['2024-01-01', '2024-12-31'] } }, // This year
          { expires_at: { $null: true } },                           // Never expires
          {
            $or: [
              { updated_at: { $null: true } },                       // Never updated
              { updated_at: { $between: ['2024-06-01', '2024-12-31'] } } // Recently updated
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"published_at" IS NOT NULL');
      expect(whereClause).toContain('"published_at" BETWEEN $1 AND $2');
      expect(whereClause).toContain('"expires_at" IS NULL');
      expect(whereClause).toContain('"updated_at" IS NULL');
      expect(whereClause).toContain('"updated_at" BETWEEN $3 AND $4');
      expect(params).toEqual(['2024-01-01', '2024-12-31', '2024-06-01', '2024-12-31']);
    });

    test('soft delete integration with range/existence', () => {
      const { whereClause, params } = FilterWhere.generate(
        {
          $and: [
            { created_at: { $between: ['2024-01-01', '2024-12-31'] } },
            { archived_at: { $null: true } },     // Not archived
            { important: true }
          ]
        },
        0,
        { includeTrashed: false, includeDeleted: false }
      );
      
      expect(whereClause).toContain('"trashed_at" IS NULL');
      expect(whereClause).toContain('"deleted_at" IS NULL');
      expect(whereClause).toContain('"created_at" BETWEEN $1 AND $2');
      expect(whereClause).toContain('"archived_at" IS NULL');
      expect(whereClause).toContain('"important" = $3');
      expect(params).toEqual(['2024-01-01', '2024-12-31', true]);
    });
  });

  describe('Performance and Edge Cases', () => {
    test('multiple range conditions', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { age: { $between: [18, 65] } },
          { salary: { $between: [30000, 200000] } },
          { experience_years: { $between: [1, 20] } },
          { rating: { $between: [3.0, 5.0] } }
        ]
      });
      
      expect(params).toEqual([18, 65, 30000, 200000, 1, 20, 3.0, 5.0]);
      expect(whereClause.split('BETWEEN').length - 1).toBe(4); // 4 BETWEEN operations
    });

    test('existence checks on all field types', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { string_field: { $exists: true } },
          { number_field: { $exists: true } },
          { boolean_field: { $exists: true } },
          { date_field: { $exists: true } },
          { array_field: { $exists: true } },
          { json_field: { $exists: true } }
        ]
      });
      
      expect(whereClause).toContain('"string_field" IS NOT NULL');
      expect(whereClause).toContain('"number_field" IS NOT NULL');
      expect(whereClause).toContain('"boolean_field" IS NOT NULL');
      expect(whereClause).toContain('"date_field" IS NOT NULL');
      expect(whereClause).toContain('"array_field" IS NOT NULL');
      expect(whereClause).toContain('"json_field" IS NOT NULL');
      expect(params).toEqual([]);
    });

    test('range overlap scenarios', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { start_date: { $between: ['2024-01-01', '2024-06-30'] } },   // First half
          { end_date: { $between: ['2024-07-01', '2024-12-31'] } },     // Second half
          {
            $and: [
              { start_date: { $between: ['2024-03-01', '2024-09-30'] } }, // Overlap period
              { priority: 'high' }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"start_date" BETWEEN $1 AND $2');
      expect(whereClause).toContain('"end_date" BETWEEN $3 AND $4');
      expect(whereClause).toContain('"start_date" BETWEEN $5 AND $6');
      expect(whereClause).toContain('"priority" = $7');
      expect(params).toEqual(['2024-01-01', '2024-06-30', '2024-07-01', '2024-12-31', '2024-03-01', '2024-09-30', 'high']);
    });
  });
});