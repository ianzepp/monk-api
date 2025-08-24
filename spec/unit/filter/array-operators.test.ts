import { describe, test, expect } from 'vitest';
import { FilterWhere } from '@lib/filter-where.js';

describe('PostgreSQL Array Operators - Comprehensive Testing', () => {
  
  describe('$any operator (Array Overlap)', () => {
    test('simple array overlap', () => {
      const { whereClause, params } = FilterWhere.generate({
        access_read: { $any: ['user-123', 'group-456'] }
      });
      
      expect(whereClause).toContain('"access_read" && ARRAY[$1, $2]');
      expect(params).toEqual(['user-123', 'group-456']);
    });

    test('single element array', () => {
      const { whereClause, params } = FilterWhere.generate({
        tags: { $any: ['urgent'] }
      });
      
      expect(whereClause).toContain('"tags" && ARRAY[$1]');
      expect(params).toEqual(['urgent']);
    });

    test('empty array - always false', () => {
      const { whereClause, params } = FilterWhere.generate({
        tags: { $any: [] }
      });
      
      expect(whereClause).toContain('1=0'); // Always false
      expect(params).toEqual([]);
    });

    test('large arrays (performance test)', () => {
      const largeArray = Array.from({ length: 50 }, (_, i) => `item-${i}`);
      const { whereClause, params } = FilterWhere.generate({
        permissions: { $any: largeArray }
      });
      
      expect(whereClause).toContain('"permissions" && ARRAY[');
      expect(params).toHaveLength(50);
      expect(params[0]).toBe('item-0');
      expect(params[49]).toBe('item-49');
    });

    test('UUID arrays for ACL scenarios', () => {
      const userContext = [
        '550e8400-e29b-41d4-a716-446655440000', // user_id
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8', // group_id  
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8'  // domain_id
      ];
      
      const { whereClause, params } = FilterWhere.generate({
        access_read: { $any: userContext }
      });
      
      expect(whereClause).toContain('"access_read" && ARRAY[$1, $2, $3]');
      expect(params).toEqual(userContext);
    });

    test('non-array value converts to single element', () => {
      const { whereClause, params } = FilterWhere.generate({
        tags: { $any: 'single-tag' }
      });
      
      expect(whereClause).toContain('"tags" && ARRAY[$1]');
      expect(params).toEqual(['single-tag']);
    });
  });

  describe('$all operator (Array Contains)', () => {
    test('array contains all elements', () => {
      const { whereClause, params } = FilterWhere.generate({
        tags: { $all: ['feature', 'backend', 'api'] }
      });
      
      expect(whereClause).toContain('"tags" @> ARRAY[$1, $2, $3]');
      expect(params).toEqual(['feature', 'backend', 'api']);
    });

    test('single element requirement', () => {
      const { whereClause, params } = FilterWhere.generate({
        permissions: { $all: ['read'] }
      });
      
      expect(whereClause).toContain('"permissions" @> ARRAY[$1]');
      expect(params).toEqual(['read']);
    });

    test('empty array - always true', () => {
      const { whereClause, params } = FilterWhere.generate({
        tags: { $all: [] }
      });
      
      expect(whereClause).toContain('1=1'); // Always true
      expect(params).toEqual([]);
    });

    test('required permissions scenario', () => {
      const requiredPerms = ['read', 'write', 'execute'];
      const { whereClause, params } = FilterWhere.generate({
        user_permissions: { $all: requiredPerms }
      });
      
      expect(whereClause).toContain('"user_permissions" @> ARRAY[$1, $2, $3]');
      expect(params).toEqual(requiredPerms);
    });

    test('order independence verification', () => {
      const perms1 = ['read', 'write'];
      const perms2 = ['write', 'read'];
      
      const result1 = FilterWhere.generate({
        permissions: { $all: perms1 }
      });
      
      const result2 = FilterWhere.generate({
        permissions: { $all: perms2 }
      });
      
      // SQL should be the same structure (PostgreSQL @> is order-independent)
      expect(result1.whereClause).toContain('"permissions" @> ARRAY[');
      expect(result2.whereClause).toContain('"permissions" @> ARRAY[');
      expect(result1.params).toEqual(['read', 'write']);
      expect(result2.params).toEqual(['write', 'read']);
    });
  });

  describe('$nany operator (NOT Array Overlap)', () => {
    test('NOT array overlap', () => {
      const { whereClause, params } = FilterWhere.generate({
        access_deny: { $nany: ['user-123'] }
      });
      
      expect(whereClause).toContain('NOT ("access_deny" && ARRAY[$1])');
      expect(params).toEqual(['user-123']);
    });

    test('multiple denied users', () => {
      const { whereClause, params } = FilterWhere.generate({
        blacklist: { $nany: ['user-123', 'user-456', 'user-789'] }
      });
      
      expect(whereClause).toContain('NOT ("blacklist" && ARRAY[$1, $2, $3])');
      expect(params).toEqual(['user-123', 'user-456', 'user-789']);
    });

    test('empty array - always true', () => {
      const { whereClause } = FilterWhere.generate({
        access_deny: { $nany: [] }
      });
      
      expect(whereClause).toContain('1=1'); // Always true (no denial)
    });

    test('ACL denial scenario', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { access_read: { $any: ['user-123'] } },      // Has read access
          { access_deny: { $nany: ['user-123'] } }       // NOT denied
        ]
      });
      
      expect(whereClause).toContain('"access_read" && ARRAY[$1]');
      expect(whereClause).toContain('NOT ("access_deny" && ARRAY[$2])');
      expect(params).toEqual(['user-123', 'user-123']);
    });
  });

  describe('$nall operator (NOT Array Contains)', () => {
    test('NOT array contains all', () => {
      const { whereClause, params } = FilterWhere.generate({
        restricted_permissions: { $nall: ['admin', 'root'] }
      });
      
      expect(whereClause).toContain('NOT ("restricted_permissions" @> ARRAY[$1, $2])');
      expect(params).toEqual(['admin', 'root']);
    });

    test('empty array - always false', () => {
      const { whereClause } = FilterWhere.generate({
        permissions: { $nall: [] }
      });
      
      expect(whereClause).toContain('1=0'); // Always false
    });

    test('security restriction scenario', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { user_permissions: { $all: ['read', 'write'] } },        // Has required perms
          { restricted_tags: { $nall: ['classified', 'secret'] } }  // Doesn't have restricted tags
        ]
      });
      
      expect(whereClause).toContain('"user_permissions" @> ARRAY[$1, $2]');
      expect(whereClause).toContain('NOT ("restricted_tags" @> ARRAY[$3, $4])');
      expect(params).toEqual(['read', 'write', 'classified', 'secret']);
    });
  });

  describe('$size operator (Array Size)', () => {
    test('exact array size', () => {
      const { whereClause, params } = FilterWhere.generate({
        tags: { $size: 3 }
      });
      
      expect(whereClause).toContain('array_length("tags", 1) = $1');
      expect(params).toEqual([3]);
    });

    test('zero size arrays', () => {
      const { whereClause, params } = FilterWhere.generate({
        empty_field: { $size: 0 }
      });
      
      expect(whereClause).toContain('array_length("empty_field", 1) = $1');
      expect(params).toEqual([0]);
    });

    test('size with BETWEEN operator', () => {
      const { whereClause, params } = FilterWhere.generate({
        tags: { $size: { $between: [2, 10] } }
      });
      
      expect(whereClause).toContain('array_length("tags", 1) BETWEEN $1 AND $2');
      expect(params).toEqual([2, 10]);
    });

    test('size with IN operator', () => {
      const { whereClause, params } = FilterWhere.generate({
        permissions: { $size: { $in: [1, 3, 5] } }
      });
      
      expect(whereClause).toContain('array_length("permissions", 1) IN ($1, $2, $3)');
      expect(params).toEqual([1, 3, 5]);
    });

    test('size with NOT IN operator', () => {
      const { whereClause, params } = FilterWhere.generate({
        access_list: { $size: { $nin: [0, 999] } }
      });
      
      expect(whereClause).toContain('array_length("access_list", 1) NOT IN ($1, $2)');
      expect(params).toEqual([0, 999]);
    });

    test('size with logical operators', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { tags: { $size: { $gte: 1 } } },      // Has at least one tag
          { permissions: { $size: { $lte: 5 } } } // Not too many permissions
        ]
      });
      
      expect(whereClause).toContain('array_length("tags", 1) >= $1');
      expect(whereClause).toContain('array_length("permissions", 1) <= $2');
      expect(params).toEqual([1, 5]);
    });

    test('size filtering for access control', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { access_full: { $size: { $gte: 1 } } },   // Has full access
          {
            $and: [
              { access_read: { $size: { $gte: 1 } } }, // Has read access
              { access_deny: { $size: 0 } }            // No denial entries
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('array_length("access_full", 1) >= $1');
      expect(whereClause).toContain('array_length("access_read", 1) >= $2');
      expect(whereClause).toContain('array_length("access_deny", 1) = $3');
      expect(params).toEqual([1, 1, 0]);
    });
  });

  describe('Array Operator Combinations', () => {
    test('any + all + size together', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { user_tags: { $any: ['verified', 'premium'] } },      // User has verified OR premium
          { required_perms: { $all: ['read', 'write'] } },       // Has all required permissions
          { access_levels: { $size: { $gte: 2 } } },             // Has multiple access levels
          { blacklist: { $nany: ['restricted'] } }               // NOT blacklisted
        ]
      });
      
      expect(whereClause).toContain('"user_tags" && ARRAY[$1, $2]');
      expect(whereClause).toContain('"required_perms" @> ARRAY[$3, $4]');
      expect(whereClause).toContain('array_length("access_levels", 1) >= $5');
      expect(whereClause).toContain('NOT ("blacklist" && ARRAY[$6])');
      expect(params).toEqual(['verified', 'premium', 'read', 'write', 2, 'restricted']);
    });

    test('complex ACL with multiple user contexts', () => {
      const userIds = ['user-123'];
      const groupIds = ['group-456', 'group-789'];
      const domainIds = ['domain-abc'];
      
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          {
            $or: [
              { access_read: { $any: [...userIds, ...groupIds, ...domainIds] } },
              { access_edit: { $any: [...userIds, ...groupIds, ...domainIds] } },
              { access_full: { $any: [...userIds, ...groupIds, ...domainIds] } }
            ]
          },
          { access_deny: { $nany: [...userIds, ...groupIds, ...domainIds] } },
          { status: { $nin: ['deleted', 'suspended'] } }
        ]
      });
      
      // Should generate complex ACL query with proper parameter management
      expect(params.length).toBeGreaterThan(15); // Multiple access arrays + deny + status
      expect(whereClause).toContain('&&');
      expect(whereClause).toContain('NOT');
      expect(whereClause).toContain('NOT IN');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('null values in arrays', () => {
      const { whereClause, params } = FilterWhere.generate({
        tags: { $any: [null, 'valid-tag', undefined] }
      });
      
      expect(whereClause).toContain('"tags" && ARRAY[$1, $2, $3]');
      expect(params).toEqual([null, 'valid-tag', undefined]);
    });

    test('mixed data types in arrays', () => {
      const { whereClause, params } = FilterWhere.generate({
        mixed_field: { $all: ['string', 123, true, null] }
      });
      
      expect(whereClause).toContain('"mixed_field" @> ARRAY[$1, $2, $3, $4]');
      expect(params).toEqual(['string', 123, true, null]);
    });

    test('very large arrays (stress test)', () => {
      const largeArray = Array.from({ length: 200 }, (_, i) => `uuid-${i.toString().padStart(3, '0')}`);
      const { whereClause, params } = FilterWhere.generate({
        large_access_list: { $any: largeArray }
      });
      
      expect(params).toHaveLength(200);
      expect(whereClause).toContain('"large_access_list" && ARRAY[');
      expect(whereClause).toContain('$200]'); // Last parameter
    });

    test('nested arrays within logical operators', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { team_access: { $any: ['team-1', 'team-2'] } },
          { individual_access: { $all: ['read', 'write'] } },
          {
            $and: [
              { guest_access: { $any: ['public'] } },
              { restricted_access: { $nall: ['private'] } }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"team_access" && ARRAY[$1, $2]');
      expect(whereClause).toContain('"individual_access" @> ARRAY[$3, $4]');
      expect(whereClause).toContain('"guest_access" && ARRAY[$5]');
      expect(whereClause).toContain('NOT ("restricted_access" @> ARRAY[$6])');
      expect(params).toEqual(['team-1', 'team-2', 'read', 'write', 'public', 'private']);
    });
  });

  describe('Real-World ACL Use Cases', () => {
    test('multi-tenant access control', () => {
      const userContext = ['user-123', 'tenant-abc', 'domain-xyz'];
      
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          {
            $or: [
              { access_read: { $any: userContext } },
              { access_edit: { $any: userContext } },
              { access_full: { $any: userContext } },
              { public_access: true }
            ]
          },
          { access_deny: { $nany: userContext } },
          { tenant: { $in: ['tenant-abc', 'shared'] } }
        ]
      });
      
      expect(whereClause).toContain('"access_read" && ARRAY[$1, $2, $3]');
      expect(whereClause).toContain('"access_edit" && ARRAY[$4, $5, $6]');
      expect(whereClause).toContain('"access_full" && ARRAY[$7, $8, $9]');
      expect(whereClause).toContain('"public_access" = $10');
      expect(whereClause).toContain('NOT ("access_deny" && ARRAY[$11, $12, $13])');
      expect(whereClause).toContain('"tenant" IN ($14, $15)');
      expect(params).toEqual([
        ...userContext,      // access_read
        ...userContext,      // access_edit  
        ...userContext,      // access_full
        true,                // public_access
        ...userContext,      // access_deny
        'tenant-abc', 'shared' // tenant
      ]);
    });

    test('hierarchical permission inheritance', () => {
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { direct_permissions: { $any: ['user-123'] } },
          {
            $and: [
              { group_permissions: { $any: ['group-456'] } },
              { group_members: { $any: ['user-123'] } }
            ]
          },
          {
            $and: [
              { domain_permissions: { $any: ['domain-789'] } },
              { domain_users: { $any: ['user-123'] } },
              { inherit_domain: true }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"direct_permissions" && ARRAY[$1]');
      expect(whereClause).toContain('"group_permissions" && ARRAY[$2]');
      expect(whereClause).toContain('"group_members" && ARRAY[$3]');
      expect(whereClause).toContain('"domain_permissions" && ARRAY[$4]');
      expect(params).toEqual(['user-123', 'group-456', 'user-123', 'domain-789', 'user-123', true]);
    });

    test('role-based array filtering', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { required_roles: { $all: ['authenticated'] } },        // Must be authenticated
          { user_roles: { $any: ['admin', 'moderator', 'user'] } }, // User has valid role
          { restricted_roles: { $nall: ['banned', 'suspended'] } }, // No restricted roles
          { active_roles: { $size: { $gte: 1 } } }                 // Has at least one active role
        ]
      });
      
      expect(whereClause).toContain('"required_roles" @> ARRAY[$1]');
      expect(whereClause).toContain('"user_roles" && ARRAY[$2, $3, $4]');
      expect(whereClause).toContain('NOT ("restricted_roles" @> ARRAY[$5, $6])');
      expect(whereClause).toContain('array_length("active_roles", 1) >= $7');
      expect(params).toEqual(['authenticated', 'admin', 'moderator', 'user', 'banned', 'suspended', 1]);
    });
  });

  describe('Performance and Optimization', () => {
    test('parameter indexing with multiple array operations', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { tags1: { $any: ['a', 'b'] } },     // $1, $2
          { tags2: { $all: ['c', 'd'] } },     // $3, $4
          { tags3: { $nany: ['e'] } },         // $5
          { tags4: { $size: 3 } }              // $6
        ]
      });
      
      expect(params).toEqual(['a', 'b', 'c', 'd', 'e', 3]);
      expect(whereClause).toContain('$1, $2');
      expect(whereClause).toContain('$3, $4');
      expect(whereClause).toContain('$5');
      expect(whereClause).toContain('$6');
    });

    test('array operations with soft delete filtering', () => {
      const { whereClause, params } = FilterWhere.generate(
        { access_read: { $any: ['user-123'] } },
        0,
        { includeTrashed: false, includeDeleted: false }
      );
      
      expect(whereClause).toContain('"trashed_at" IS NULL');
      expect(whereClause).toContain('"deleted_at" IS NULL');
      expect(whereClause).toContain('"access_read" && ARRAY[$1]');
      expect(params).toEqual(['user-123']);
    });

    test('array operations with soft delete included', () => {
      const { whereClause, params } = FilterWhere.generate(
        { access_read: { $any: ['user-123'] } },
        0,
        { includeTrashed: true, includeDeleted: true }
      );
      
      expect(whereClause).not.toContain('"trashed_at" IS NULL');
      expect(whereClause).not.toContain('"deleted_at" IS NULL');
      expect(whereClause).toContain('"access_read" && ARRAY[$1]');
      expect(params).toEqual(['user-123']);
    });
  });
});