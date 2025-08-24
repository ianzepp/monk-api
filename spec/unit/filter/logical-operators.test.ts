import { describe, test, expect } from 'vitest';
import { FilterWhere } from '@lib/filter-where.js';

describe('Logical Operators - Comprehensive Testing', () => {
  
  describe('$and operator', () => {
    test('simple AND conditions', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { status: 'active' },
          { age: { $gte: 18 } }
        ]
      });
      
      expect(whereClause).toContain('("status" = $1 AND "age" >= $2)');
      expect(params).toEqual(['active', 18]);
    });

    test('nested AND with OR', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { status: 'active' },
          {
            $or: [
              { role: 'admin' },
              { role: 'moderator' }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"status" = $1');
      expect(whereClause).toContain('("role" = $2 OR "role" = $3)');
      expect(params).toEqual(['active', 'admin', 'moderator']);
    });

    test('deeply nested AND (4 levels)', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { status: 'active' },
          {
            $and: [
              { verified: true },
              {
                $or: [
                  { role: 'admin' },
                  {
                    $and: [
                      { role: 'user' },
                      { premium: true }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
      
      // Should handle deep nesting without issues
      expect(whereClause).toContain('"status" = $1');
      expect(whereClause).toContain('"verified" = $2');
      expect(whereClause).toContain('"role" = $3');
      expect(whereClause).toContain('"premium" = $5');
      expect(params).toEqual(['active', true, 'admin', 'user', true]);
    });

    test('empty AND conditions', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: []
      });
      
      expect(whereClause).toContain('1=1'); // Always true
      expect(params).toEqual([]);
    });

    test('single condition AND (should not add extra parentheses)', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { status: 'active' }
        ]
      });
      
      expect(whereClause).toContain('"status" = $1');
      expect(params).toEqual(['active']);
    });

    test('AND with mixed operator types', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { name: { $like: 'John%' } },
          { age: { $between: [18, 65] } },
          { tags: { $any: ['vip', 'premium'] } },
          { status: { $nin: ['banned', 'suspended'] } }
        ]
      });
      
      expect(whereClause).toContain('"name" LIKE $1');
      expect(whereClause).toContain('"age" BETWEEN $2 AND $3');
      expect(whereClause).toContain('"tags" && ARRAY[$4, $5]');
      expect(whereClause).toContain('"status" NOT IN ($6, $7)');
      expect(params).toEqual(['John%', 18, 65, 'vip', 'premium', 'banned', 'suspended']);
    });
  });

  describe('$or operator', () => {
    test('simple OR conditions', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { role: 'admin' },
          { role: 'moderator' }
        ]
      });
      
      expect(whereClause).toContain('("role" = $1 OR "role" = $2)');
      expect(params).toEqual(['admin', 'moderator']);
    });

    test('nested OR with AND', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          {
            $and: [
              { role: 'user' },
              { verified: true }
            ]
          },
          { role: 'admin' }
        ]
      });
      
      expect(whereClause).toContain('("role" = $1 AND "verified" = $2) OR "role" = $3');
      expect(params).toEqual(['user', true, 'admin']);
    });

    test('complex OR with multiple access levels', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { access_read: { $any: ['user-123'] } },
          { access_edit: { $any: ['user-123'] } },
          { access_full: { $any: ['user-123'] } }
        ]
      });
      
      expect(whereClause).toContain('"access_read" && ARRAY[$1]');
      expect(whereClause).toContain('"access_edit" && ARRAY[$2]');
      expect(whereClause).toContain('"access_full" && ARRAY[$3]');
      expect(whereClause).toContain(' OR ');
      expect(params).toEqual(['user-123', 'user-123', 'user-123']);
    });

    test('empty OR conditions', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: []
      });
      
      expect(whereClause).toContain('1=0'); // Always false
      expect(params).toEqual([]);
    });

    test('OR with different data types', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { age: null },
          { age: { $gte: 21 } },
          { status: { $in: ['verified', 'premium'] } }
        ]
      });
      
      expect(whereClause).toContain('"age" IS NULL');
      expect(whereClause).toContain('"age" >= $1');
      expect(whereClause).toContain('"status" IN ($2, $3)');
      expect(params).toEqual([21, 'verified', 'premium']);
    });
  });

  describe('$not operator', () => {
    test('simple NOT condition', () => {
      const { whereClause, params } = FilterWhere.generate({
        $not: [{ status: 'banned' }]
      });
      
      expect(whereClause).toContain('NOT ("status" = $1)');
      expect(params).toEqual(['banned']);
    });

    test('NOT with complex nested conditions', () => {
      const { whereClause, params } = FilterWhere.generate({
        $not: [
          {
            $and: [
              { role: 'temp' },
              { verified: false }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('NOT (("role" = $1 AND "verified" = $2))');
      expect(params).toEqual(['temp', false]);
    });

    test('double NOT should be positive', () => {
      const { whereClause, params } = FilterWhere.generate({
        $not: [
          {
            $not: [
              { status: 'active' }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('NOT (NOT ("status" = $1))');
      expect(params).toEqual(['active']);
    });

    test('NOT with array operations', () => {
      const { whereClause, params } = FilterWhere.generate({
        $not: [
          { access_deny: { $any: ['user-123', 'group-456'] } }
        ]
      });
      
      expect(whereClause).toContain('NOT ("access_deny" && ARRAY[$1, $2])');
      expect(params).toEqual(['user-123', 'group-456']);
    });
  });

  describe('$nand operator', () => {
    test('simple NAND condition', () => {
      const { whereClause, params } = FilterWhere.generate({
        $nand: [
          { role: 'temp' },
          { verified: false }
        ]
      });
      
      expect(whereClause).toContain('NOT ("role" = $1 AND "verified" = $2)');
      expect(params).toEqual(['temp', false]);
    });

    test('NAND with nested OR conditions', () => {
      const { whereClause, params } = FilterWhere.generate({
        $nand: [
          {
            $or: [
              { status: 'guest' },
              { status: 'temp' }
            ]
          },
          { verified: false }
        ]
      });
      
      expect(whereClause).toContain('NOT (("status" = $1 OR "status" = $2) AND "verified" = $3)');
      expect(params).toEqual(['guest', 'temp', false]);
    });

    test('empty NAND conditions', () => {
      const { whereClause } = FilterWhere.generate({
        $nand: []
      });
      
      expect(whereClause).toContain('1=1'); // Always true
    });
  });

  describe('$nor operator', () => {
    test('simple NOR condition', () => {
      const { whereClause, params } = FilterWhere.generate({
        $nor: [
          { status: 'banned' },
          { status: 'suspended' }
        ]
      });
      
      expect(whereClause).toContain('NOT ("status" = $1 OR "status" = $2)');
      expect(params).toEqual(['banned', 'suspended']);
    });

    test('NOR with array operations', () => {
      const { whereClause, params } = FilterWhere.generate({
        $nor: [
          { access_deny: { $any: ['user-123'] } },
          { blacklist: { $all: ['restricted'] } }
        ]
      });
      
      expect(whereClause).toContain('NOT ("access_deny" && ARRAY[$1] OR "blacklist" @> ARRAY[$2])');
      expect(params).toEqual(['user-123', 'restricted']);
    });

    test('empty NOR conditions', () => {
      const { whereClause } = FilterWhere.generate({
        $nor: []
      });
      
      expect(whereClause).toContain('1=1'); // Always true
    });
  });

  describe('Complex Logical Combinations', () => {
    test('5-level deep nesting', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { tenant: 'production' },
          {
            $or: [
              { role: 'admin' },
              {
                $and: [
                  { role: 'user' },
                  { verified: true },
                  {
                    $not: [
                      {
                        $or: [
                          { status: 'suspended' },
                          { access_deny: { $any: ['user-123'] } }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
      
      // Verify deep nesting works
      expect(whereClause).toContain('"tenant" = $1');
      expect(whereClause).toContain('"role" = $2');
      expect(whereClause).toContain('"verified" = $4');
      expect(whereClause).toContain('NOT (("status" = $5 OR "access_deny" && ARRAY[$6]))');
      expect(params).toEqual(['production', 'admin', 'user', true, 'suspended', 'user-123']);
    });

    test('mixed logical operators', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          {
            $nand: [
              { role: 'guest' },
              { verified: false }
            ]
          },
          {
            $nor: [
              { status: 'banned' },
              { status: 'deleted' }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('NOT ("role" = $1 AND "verified" = $2)');
      expect(whereClause).toContain('NOT ("status" = $3 OR "status" = $4)');
      expect(params).toEqual(['guest', false, 'banned', 'deleted']);
    });

    test('parameter indexing with complex nesting', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          {
            $and: [
              { field1: 'value1' },
              { field2: 'value2' },
              { field3: 'value3' }
            ]
          },
          {
            $and: [
              { field4: 'value4' },
              { field5: 'value5' }
            ]
          }
        ]
      });
      
      // Verify parameter order is correct across nesting
      expect(params).toEqual(['value1', 'value2', 'value3', 'value4', 'value5']);
      expect(whereClause).toContain('$1');
      expect(whereClause).toContain('$5');
    });
  });

  describe('Error Handling', () => {
    test('logical operators require arrays', () => {
      expect(() => {
        FilterWhere.generate({
          $and: { status: 'active' } // Object instead of array
        });
      }).toThrow('Logical operator $and requires array of conditions');
    });

    test('nested invalid operators', () => {
      expect(() => {
        FilterWhere.generate({
          $and: [
            { status: 'active' },
            { age: { $invalid: 18 } } // Invalid operator
          ]
        });
      }).not.toThrow(); // Should not crash, just warn
    });

    test('null/undefined in logical conditions', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { status: null },
          { age: undefined }
        ]
      });
      
      expect(whereClause).toContain('"status" IS NULL');
      expect(whereClause).toContain('"age" IS NULL');
      expect(params).toEqual([]);
    });
  });

  describe('Performance Edge Cases', () => {
    test('large number of AND conditions (100)', () => {
      const conditions = [];
      for (let i = 0; i < 100; i++) {
        conditions.push({ [`field${i}`]: `value${i}` });
      }
      
      const { whereClause, params } = FilterWhere.generate({
        $and: conditions
      });
      
      expect(params).toHaveLength(100);
      expect(whereClause).toContain('"field0" = $1');
      expect(whereClause).toContain('"field99" = $100');
    });

    test('deeply nested with many branches', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          {
            $and: [
              { type: 'user' },
              { $or: [{ role: 'admin' }, { role: 'mod' }] }
            ]
          },
          {
            $and: [
              { type: 'system' },
              { $or: [{ role: 'service' }, { role: 'api' }] }
            ]
          },
          {
            $and: [
              { type: 'guest' },
              { verified: true }
            ]
          }
        ]
      });
      
      // Should handle complex branching without parameter conflicts
      expect(params).toEqual(['user', 'admin', 'mod', 'system', 'service', 'api', 'guest', true]);
      expect(whereClause.split('$').length - 1).toBe(8); // 8 parameters used
    });
  });

  describe('Real-World ACL Scenarios', () => {
    test('user access with role fallback', () => {
      const userId = 'user-123';
      const userGroups = ['group-456', 'group-789'];
      
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { access_read: { $any: [userId, ...userGroups] } },
          { access_edit: { $any: [userId, ...userGroups] } },
          { access_full: { $any: [userId, ...userGroups] } }
        ]
      });
      
      expect(whereClause).toContain('"access_read" && ARRAY[$1, $2, $3]');
      expect(whereClause).toContain('"access_edit" && ARRAY[$4, $5, $6]');
      expect(whereClause).toContain('"access_full" && ARRAY[$7, $8, $9]');
      expect(params).toEqual([
        userId, ...userGroups,
        userId, ...userGroups, 
        userId, ...userGroups
      ]);
    });

    test('access with explicit denial override', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          {
            $or: [
              { access_read: { $any: ['user-123'] } },
              { access_edit: { $any: ['user-123'] } }
            ]
          },
          {
            $not: [
              { access_deny: { $any: ['user-123'] } }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"access_read" && ARRAY[$1] OR "access_edit" && ARRAY[$2]');
      expect(whereClause).toContain('NOT ("access_deny" && ARRAY[$3])');
      expect(params).toEqual(['user-123', 'user-123', 'user-123']);
    });
  });

  describe('FTP Wildcard Translation Scenarios', () => {
    test('multiple wildcard components', () => {
      // Simulates: /data/users/*admin*/department/*eng*/
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { id: { $like: '%admin%' } },
          { department: { $like: '%eng%' } }
        ]
      });
      
      expect(whereClause).toContain('("id" LIKE $1 AND "department" LIKE $2)');
      expect(params).toEqual(['%admin%', '%eng%']);
    });

    test('alternative patterns', () => {
      // Simulates: /data/users/(admin|moderator)/
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { role: 'admin' },
          { role: 'moderator' }
        ]
      });
      
      expect(whereClause).toContain('("role" = $1 OR "role" = $2)');
      expect(params).toEqual(['admin', 'moderator']);
    });

    test('exclusion patterns', () => {
      // Simulates: /data/users/!(temp|guest)/
      const { whereClause, params } = FilterWhere.generate({
        $not: [
          {
            $or: [
              { role: 'temp' },
              { role: 'guest' }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('NOT (("role" = $1 OR "role" = $2))');
      expect(params).toEqual(['temp', 'guest']);
    });
  });
});