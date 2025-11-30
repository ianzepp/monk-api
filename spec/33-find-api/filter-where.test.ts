import { describe, it, expect } from 'bun:test';
import { FilterWhere } from '@src/lib/filter-where.js';

describe('FilterWhere - Basic Comparison Operators', () => {
    it('should generate $eq condition', () => {
        const { whereClause, params } = FilterWhere.generate({ age: 25 });

        expect(whereClause).toContain('"age" = $1');
        expect(params).toEqual([25]);
    });

    it('should generate $eq with explicit operator', () => {
        const { whereClause, params } = FilterWhere.generate({ age: { $eq: 25 } });

        expect(whereClause).toContain('"age" = $1');
        expect(params).toEqual([25]);
    });

    it('should handle null values with IS NULL', () => {
        const { whereClause, params } = FilterWhere.generate({ description: null });

        expect(whereClause).toContain('"description" IS NULL');
        expect(params).toEqual([]);
    });

    it('should generate $ne condition', () => {
        const { whereClause, params } = FilterWhere.generate({ status: { $ne: 'inactive' } });

        expect(whereClause).toContain('"status" != $1');
        expect(params).toEqual(['inactive']);
    });

    it('should handle $ne with null using IS NOT NULL', () => {
        const { whereClause, params } = FilterWhere.generate({ email: { $ne: null } });

        expect(whereClause).toContain('"email" IS NOT NULL');
        expect(params).toEqual([]);
    });

    it('should generate $gt condition', () => {
        const { whereClause, params } = FilterWhere.generate({ age: { $gt: 18 } });

        expect(whereClause).toContain('"age" > $1');
        expect(params).toEqual([18]);
    });

    it('should generate $gte condition', () => {
        const { whereClause, params } = FilterWhere.generate({ age: { $gte: 21 } });

        expect(whereClause).toContain('"age" >= $1');
        expect(params).toEqual([21]);
    });

    it('should generate $lt condition', () => {
        const { whereClause, params } = FilterWhere.generate({ age: { $lt: 65 } });

        expect(whereClause).toContain('"age" < $1');
        expect(params).toEqual([65]);
    });

    it('should generate $lte condition', () => {
        const { whereClause, params } = FilterWhere.generate({ score: { $lte: 100 } });

        expect(whereClause).toContain('"score" <= $1');
        expect(params).toEqual([100]);
    });

    it('should handle multiple operators on same field', () => {
        const { whereClause, params } = FilterWhere.generate({ age: { $gte: 18, $lt: 65 } });

        expect(whereClause).toContain('"age" >= $1');
        expect(whereClause).toContain('"age" < $2');
        expect(params).toEqual([18, 65]);
    });
});

describe('FilterWhere - String Pattern Operators', () => {
    it('should generate $like condition', () => {
        const { whereClause, params } = FilterWhere.generate({ name: { $like: 'John%' } });

        expect(whereClause).toContain('"name" LIKE $1');
        expect(params).toEqual(['John%']);
    });

    it('should generate $nlike condition', () => {
        const { whereClause, params } = FilterWhere.generate({ name: { $nlike: '%test%' } });

        expect(whereClause).toContain('"name" NOT LIKE $1');
        expect(params).toEqual(['%test%']);
    });

    it('should generate $ilike condition (case-insensitive)', () => {
        const { whereClause, params } = FilterWhere.generate({ email: { $ilike: '%@EXAMPLE.COM' } });

        expect(whereClause).toContain('"email" ILIKE $1');
        expect(params).toEqual(['%@EXAMPLE.COM']);
    });

    it('should generate $nilike condition', () => {
        const { whereClause, params } = FilterWhere.generate({ email: { $nilike: '%spam%' } });

        expect(whereClause).toContain('"email" NOT ILIKE $1');
        expect(params).toEqual(['%spam%']);
    });

    it('should generate $regex condition', () => {
        const { whereClause, params } = FilterWhere.generate({ code: { $regex: '^[A-Z]{3}$' } });

        expect(whereClause).toContain('"code" ~ $1');
        expect(params).toEqual(['^[A-Z]{3}$']);
    });

    it('should generate $nregex condition', () => {
        const { whereClause, params } = FilterWhere.generate({ code: { $nregex: '^[0-9]+$' } });

        expect(whereClause).toContain('"code" !~ $1');
        expect(params).toEqual(['^[0-9]+$']);
    });
});

describe('FilterWhere - Array Value Operators', () => {
    it('should generate $in condition', () => {
        const { whereClause, params } = FilterWhere.generate({ status: { $in: ['active', 'pending'] } });

        expect(whereClause).toContain('"status" IN ($1, $2)');
        expect(params).toEqual(['active', 'pending']);
    });

    it('should handle array value as implicit $in', () => {
        const { whereClause, params } = FilterWhere.generate({ id: ['abc', 'def', 'ghi'] });

        expect(whereClause).toContain('"id" IN ($1, $2, $3)');
        expect(params).toEqual(['abc', 'def', 'ghi']);
    });

    it('should handle empty $in array as always false', () => {
        const { whereClause, params } = FilterWhere.generate({ status: { $in: [] } });

        expect(whereClause).toContain('1=0');
        expect(params).toEqual([]);
    });

    it('should generate $nin condition', () => {
        const { whereClause, params } = FilterWhere.generate({ status: { $nin: ['deleted', 'banned'] } });

        expect(whereClause).toContain('"status" NOT IN ($1, $2)');
        expect(params).toEqual(['deleted', 'banned']);
    });

    it('should handle empty $nin array as always true', () => {
        const { whereClause, params } = FilterWhere.generate({ status: { $nin: [] } });

        expect(whereClause).toContain('1=1');
        expect(params).toEqual([]);
    });
});

describe('FilterWhere - PostgreSQL Array Operators', () => {
    it('should generate $any condition (array overlap)', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $any: ['urgent', 'important'] } });

        expect(whereClause).toContain('"tags" && ARRAY[$1, $2]');
        expect(params).toEqual(['urgent', 'important']);
    });

    it('should generate $all condition (array contains all)', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $all: ['reviewed', 'approved'] } });

        expect(whereClause).toContain('"tags" @> ARRAY[$1, $2]');
        expect(params).toEqual(['reviewed', 'approved']);
    });

    it('should generate $nany condition (no array overlap)', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $nany: ['spam', 'blocked'] } });

        expect(whereClause).toContain('NOT ("tags" && ARRAY[$1, $2])');
        expect(params).toEqual(['spam', 'blocked']);
    });

    it('should generate $nall condition (does not contain all)', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $nall: ['required', 'mandatory'] } });

        expect(whereClause).toContain('NOT ("tags" @> ARRAY[$1, $2])');
        expect(params).toEqual(['required', 'mandatory']);
    });

    it('should handle empty array for $any as always false', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $any: [] } });

        expect(whereClause).toContain('1=0');
        expect(params).toEqual([]);
    });

    it('should handle empty array for $all as always true', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $all: [] } });

        expect(whereClause).toContain('1=1');
        expect(params).toEqual([]);
    });
});

describe('FilterWhere - Array Size Operator', () => {
    it('should generate $size condition with exact value', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $size: 3 } });

        expect(whereClause).toContain('array_length("tags", 1) = $1');
        expect(params).toEqual([3]);
    });

    it('should generate $size with $gte operator', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $size: { $gte: 1 } } });

        expect(whereClause).toContain('array_length("tags", 1) >= $1');
        expect(params).toEqual([1]);
    });

    it('should generate $size with $between operator', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $size: { $between: [1, 10] } } });

        expect(whereClause).toContain('array_length("tags", 1) BETWEEN $1 AND $2');
        expect(params).toEqual([1, 10]);
    });

    it('should generate $size with $in operator', () => {
        const { whereClause, params } = FilterWhere.generate({ tags: { $size: { $in: [0, 1, 2] } } });

        expect(whereClause).toContain('array_length("tags", 1) IN ($1, $2, $3)');
        expect(params).toEqual([0, 1, 2]);
    });
});

describe('FilterWhere - Range Operators', () => {
    it('should generate $between condition', () => {
        const { whereClause, params } = FilterWhere.generate({ age: { $between: [18, 65] } });

        expect(whereClause).toContain('"age" BETWEEN $1 AND $2');
        expect(params).toEqual([18, 65]);
    });

    it('should throw error for $between with invalid array', () => {
        expect(() => {
            FilterWhere.generate({ age: { $between: [18] } });
        }).toThrow('$between operator requires array with exactly 2 elements [min, max]');
    });

    it('should throw error for $between with null values', () => {
        expect(() => {
            FilterWhere.generate({ age: { $between: [null, 65] } });
        }).toThrow('$between requires non-null values');
    });
});

describe('FilterWhere - Existence Operators', () => {
    it('should generate $exists: true as IS NOT NULL', () => {
        const { whereClause, params } = FilterWhere.generate({ email: { $exists: true } });

        expect(whereClause).toContain('"email" IS NOT NULL');
        expect(params).toEqual([]);
    });

    it('should generate $exists: false as IS NULL', () => {
        const { whereClause, params } = FilterWhere.generate({ email: { $exists: false } });

        expect(whereClause).toContain('"email" IS NULL');
        expect(params).toEqual([]);
    });

    it('should generate $null: true as IS NULL', () => {
        const { whereClause, params } = FilterWhere.generate({ deleted_at: { $null: true } });

        expect(whereClause).toContain('"deleted_at" IS NULL');
        expect(params).toEqual([]);
    });

    it('should generate $null: false as IS NOT NULL', () => {
        const { whereClause, params } = FilterWhere.generate({ deleted_at: { $null: false } });

        expect(whereClause).toContain('"deleted_at" IS NOT NULL');
        expect(params).toEqual([]);
    });
});

describe('FilterWhere - Search Operators', () => {
    it('should generate $find condition (wraps with wildcards)', () => {
        const { whereClause, params } = FilterWhere.generate({ name: { $find: 'john' } });

        expect(whereClause).toContain('"name" ILIKE $1');
        expect(params).toEqual(['%john%']);
    });

    it('should generate $text condition (wraps with wildcards)', () => {
        const { whereClause, params } = FilterWhere.generate({ description: { $text: 'search term' } });

        expect(whereClause).toContain('"description" ILIKE $1');
        expect(params).toEqual(['%search term%']);
    });
});

describe('FilterWhere - Logical Operators', () => {
    it('should generate $and condition', () => {
        const { whereClause, params } = FilterWhere.generate({
            $and: [
                { age: { $gte: 18 } },
                { status: 'active' }
            ]
        });

        expect(whereClause).toContain('"age" >= $1');
        expect(whereClause).toContain('"status" = $2');
        expect(whereClause).toContain('AND');
        expect(params).toEqual([18, 'active']);
    });

    it('should generate $or condition', () => {
        const { whereClause, params } = FilterWhere.generate({
            $or: [
                { status: 'active' },
                { status: 'pending' }
            ]
        });

        expect(whereClause).toContain('"status" = $1');
        expect(whereClause).toContain('"status" = $2');
        expect(whereClause).toContain('OR');
        expect(params).toEqual(['active', 'pending']);
    });

    it('should generate $not condition', () => {
        const { whereClause, params } = FilterWhere.generate({
            $not: { status: 'deleted' }
        });

        expect(whereClause).toContain('NOT');
        expect(whereClause).toContain('"status" = $1');
        expect(params).toEqual(['deleted']);
    });

    it('should generate $nand condition', () => {
        const { whereClause, params } = FilterWhere.generate({
            $nand: [
                { status: 'active' },
                { role: 'admin' }
            ]
        });

        expect(whereClause).toContain('NOT');
        expect(whereClause).toContain('"status" = $1');
        expect(whereClause).toContain('"role" = $2');
        expect(params).toEqual(['active', 'admin']);
    });

    it('should generate $nor condition', () => {
        const { whereClause, params } = FilterWhere.generate({
            $nor: [
                { status: 'deleted' },
                { status: 'banned' }
            ]
        });

        expect(whereClause).toContain('NOT');
        expect(whereClause).toContain('OR');
        expect(whereClause).toContain('"status" = $1');
        expect(whereClause).toContain('"status" = $2');
        expect(params).toEqual(['deleted', 'banned']);
    });

    it('should handle nested logical operators', () => {
        const { whereClause, params } = FilterWhere.generate({
            $and: [
                { age: { $gte: 18 } },
                {
                    $or: [
                        { status: 'active' },
                        { status: 'pending' }
                    ]
                }
            ]
        });

        expect(whereClause).toContain('"age" >= $1');
        expect(whereClause).toContain('"status" = $2');
        expect(whereClause).toContain('"status" = $3');
        expect(whereClause).toContain('AND');
        expect(whereClause).toContain('OR');
        expect(params).toEqual([18, 'active', 'pending']);
    });

    it('should throw error for empty $and array', () => {
        expect(() => {
            FilterWhere.generate({ $and: [] });
        }).toThrow('$and operator cannot have empty conditions array');
    });

    it('should throw error for empty $or array', () => {
        expect(() => {
            FilterWhere.generate({ $or: [] });
        }).toThrow('$or operator cannot have empty conditions array');
    });
});

describe('FilterWhere - Soft Delete Options', () => {
    it('should include trashed_at IS NULL by default', () => {
        const { whereClause, params } = FilterWhere.generate({ status: 'active' });

        expect(whereClause).toContain('"trashed_at" IS NULL');
        expect(whereClause).toContain('"deleted_at" IS NULL');
        expect(params).toEqual(['active']);
    });

    it('should not filter trashed_at when trashed: "include"', () => {
        const { whereClause, params } = FilterWhere.generate(
            { status: 'active' },
            0,
            { trashed: 'include' }
        );

        expect(whereClause).not.toContain('"trashed_at"');
        expect(whereClause).toContain('"deleted_at" IS NULL');
        expect(params).toEqual(['active']);
    });

    it('should filter only trashed records when trashed: "only"', () => {
        const { whereClause, params } = FilterWhere.generate(
            { status: 'active' },
            0,
            { trashed: 'only' }
        );

        expect(whereClause).toContain('"trashed_at" IS NOT NULL');
        expect(whereClause).toContain('"deleted_at" IS NULL');
        expect(params).toEqual(['active']);
    });

    it('should always exclude deleted_at records (compliance/audit only)', () => {
        const { whereClause, params } = FilterWhere.generate(
            { status: 'active' },
            0,
            { trashed: 'include' }
        );

        // deleted_at records are ALWAYS filtered out - they're kept for compliance but never visible
        expect(whereClause).toContain('"deleted_at" IS NULL');
        expect(params).toEqual(['active']);
    });
});

describe('FilterWhere - Parameter Offsetting', () => {
    it('should start parameters at offset 0 by default', () => {
        const { whereClause, params } = FilterWhere.generate({ name: 'John', age: 25 });

        expect(whereClause).toContain('$1');
        expect(whereClause).toContain('$2');
        expect(params).toEqual(['John', 25]);
    });

    it('should offset parameters when startingParamIndex provided', () => {
        const { whereClause, params } = FilterWhere.generate({ name: 'John', age: 25 }, 5);

        expect(whereClause).toContain('$6');
        expect(whereClause).toContain('$7');
        expect(params).toEqual(['John', 25]);
    });

    it('should handle parameter offsetting with complex queries', () => {
        const { whereClause, params } = FilterWhere.generate(
            { status: { $in: ['active', 'pending'] } },
            2
        );

        expect(whereClause).toContain('$3');
        expect(whereClause).toContain('$4');
        expect(params).toEqual(['active', 'pending']);
    });
});

describe('FilterWhere - Validation', () => {
    it('should throw error for invalid WHERE type (number)', () => {
        expect(() => {
            FilterWhere.generate(123 as any);
        }).toThrow('WHERE conditions must be object or string');
    });

    it('should throw error for invalid WHERE type (boolean)', () => {
        expect(() => {
            FilterWhere.generate(true as any);
        }).toThrow('WHERE conditions must be object or string');
    });

    it('should accept empty WHERE conditions', () => {
        const { whereClause, params } = FilterWhere.generate({}, 0, { trashed: 'include' });

        // Should only have deleted_at filter (trashed filter excluded with trashed: 'include')
        expect(whereClause).toContain('"deleted_at" IS NULL');
        expect(params).toEqual([]);
    });

    it('should accept null/undefined WHERE conditions', () => {
        const { whereClause, params } = FilterWhere.generate(null, 0, { trashed: 'include' });

        // Should still have deleted_at filter even with null WHERE
        expect(whereClause).toContain('"deleted_at" IS NULL');
        expect(params).toEqual([]);
    });

    it('should throw error for empty string WHERE condition', () => {
        expect(() => {
            FilterWhere.generate('   ');
        }).toThrow('WHERE condition string cannot be empty');
    });

    it('should throw error for invalid field name (SQL injection)', () => {
        expect(() => {
            FilterWhere.generate({ 'name; DROP TABLE users': 'test' });
        }).toThrow('Invalid field name format');
    });

    it('should throw error for field name with spaces', () => {
        expect(() => {
            FilterWhere.generate({ 'user name': 'test' });
        }).toThrow('Invalid field name format');
    });

    it('should accept valid field names with underscores', () => {
        const { whereClause, params } = FilterWhere.generate(
            { user_name: 'test' },
            0,
            { trashed: 'include' }
        );

        expect(whereClause).toContain('"user_name"');
        expect(params).toEqual(['test']);
    });

    it('should throw error for unsupported operator', () => {
        expect(() => {
            FilterWhere.generate({ age: { $invalid: 25 } } as any);
        }).toThrow('Unsupported filter operator');
    });

    it('should throw error for $in with non-array', () => {
        expect(() => {
            FilterWhere.generate({ status: { $in: 'active' } } as any);
        }).toThrow('Operator $in requires array data');
    });

    it('should throw error for $null with non-boolean', () => {
        expect(() => {
            FilterWhere.generate({ deleted_at: { $null: 'yes' } } as any);
        }).toThrow('$null operator requires boolean value');
    });

    it('should throw error for $exists with non-boolean', () => {
        expect(() => {
            FilterWhere.generate({ email: { $exists: 1 } } as any);
        }).toThrow('$exists operator requires boolean value');
    });

    it('should throw error for $and with non-array', () => {
        expect(() => {
            FilterWhere.generate({ $and: { status: 'active' } } as any);
        }).toThrow('$and operator requires an array of conditions');
    });

    it('should throw error for $or with empty array', () => {
        expect(() => {
            FilterWhere.generate({ $or: [] });
        }).toThrow('$or operator cannot have empty conditions array');
    });

    it('should throw error for $and with invalid condition type', () => {
        expect(() => {
            FilterWhere.generate({ $and: ['invalid', 'condition'] } as any);
        }).toThrow('$and condition at index 0 must be an object');
    });
});

describe('FilterWhere - Edge Cases', () => {
    it('should handle undefined field value as null', () => {
        const { whereClause, params } = FilterWhere.generate({ description: undefined });

        expect(whereClause).toContain('"description" IS NULL');
        expect(params).toEqual([]);
    });

    it('should handle multiple conditions on different fields', () => {
        const { whereClause, params } = FilterWhere.generate({
            name: 'John',
            age: 25,
            status: 'active'
        }, 0, { trashed: 'include' });

        expect(whereClause).toContain('"name" = $1');
        expect(whereClause).toContain('"age" = $2');
        expect(whereClause).toContain('"status" = $3');
        expect(params).toEqual(['John', 25, 'active']);
    });

    it('should handle complex nested conditions', () => {
        const { whereClause, params } = FilterWhere.generate({
            $and: [
                { age: { $gte: 18, $lt: 65 } },
                {
                    $or: [
                        { status: 'active' },
                        { status: 'pending' }
                    ]
                },
                { verified: true }
            ]
        });

        expect(whereClause).toContain('"age" >= $1');
        expect(whereClause).toContain('"age" < $2');
        expect(whereClause).toContain('"status" = $3');
        expect(whereClause).toContain('"status" = $4');
        expect(whereClause).toContain('"verified" = $5');
        expect(params).toEqual([18, 65, 'active', 'pending', true]);
    });

    it('should handle string values correctly', () => {
        const { whereClause, params } = FilterWhere.generate(
            { name: "O'Connor" },
            0,
            { trashed: 'include' }
        );

        expect(whereClause).toContain('"name" = $1');
        expect(params).toEqual(["O'Connor"]);
    });

    it('should handle numeric zero correctly', () => {
        const { whereClause, params } = FilterWhere.generate(
            { count: 0 },
            0,
            { trashed: 'include' }
        );

        expect(whereClause).toContain('"count" = $1');
        expect(params).toEqual([0]);
    });

    it('should handle boolean false correctly', () => {
        const { whereClause, params } = FilterWhere.generate(
            { active: false },
            0,
            { trashed: 'include' }
        );

        expect(whereClause).toContain('"active" = $1');
        expect(params).toEqual([false]);
    });
});

describe('FilterWhere - Static Validate Method', () => {
    it('should validate without throwing for valid WHERE data', () => {
        expect(() => {
            FilterWhere.validate({ name: 'John', age: 25 });
        }).not.toThrow();
    });

    it('should throw for invalid WHERE data', () => {
        expect(() => {
            FilterWhere.validate(123 as any);
        }).toThrow('WHERE conditions must be object or string');
    });

    it('should validate complex nested conditions', () => {
        expect(() => {
            FilterWhere.validate({
                $and: [
                    { age: { $gte: 18 } },
                    { $or: [{ status: 'active' }, { status: 'pending' }] }
                ]
            });
        }).not.toThrow();
    });

    it('should throw for invalid nested conditions', () => {
        expect(() => {
            FilterWhere.validate({
                $and: ['invalid']
            } as any);
        }).toThrow();
    });
});
