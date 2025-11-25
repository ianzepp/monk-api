/**
 * Filter Class Unit Tests
 *
 * Comprehensive tests for Filter query builder without API dependencies.
 * Tests validation, normalization, and SQL generation.
 *
 * Test Categories:
 * 1. Basic Filter Creation
 * 2. Input Validation & Normalization
 * 3. SELECT Clause Processing
 * 4. WHERE Clause Processing
 * 5. ORDER BY Clause Processing
 * 6. LIMIT/OFFSET Processing
 * 7. SQL Generation (toSQL, toWhereSQL, toCountSQL, toAggregateSQL)
 * 8. Edge Cases & Error Handling
 */

import { describe, it, expect } from 'vitest';
import { Filter } from '@src/lib/filter.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

describe('Filter - Basic Creation', () => {
    it('should create filter with valid table name', () => {
        const filter = new Filter('users');
        expect(filter).toBeInstanceOf(Filter);
    });

    it('should reject empty table name', () => {
        expect(() => new Filter('')).toThrow('Table name must be a non-empty string');
    });

    it('should reject null table name', () => {
        expect(() => new Filter(null as any)).toThrow('Table name must be a non-empty string');
    });

    it('should reject undefined table name', () => {
        expect(() => new Filter(undefined as any)).toThrow('Table name must be a non-empty string');
    });

    it('should reject table name with SQL injection patterns', () => {
        expect(() => new Filter('users; DROP TABLE users')).toThrow('Invalid table name format');
        expect(() => new Filter('users--')).toThrow('Invalid table name format');
        expect(() => new Filter('users/*')).toThrow('Invalid table name format');
    });

    it('should accept table names with underscores', () => {
        const filter = new Filter('user_profiles');
        expect(filter).toBeInstanceOf(Filter);
    });

    it('should accept table names starting with underscore', () => {
        const filter = new Filter('_private_table');
        expect(filter).toBeInstanceOf(Filter);
    });
});

describe('Filter - Input Normalization', () => {
    it('should handle empty filter (no conditions)', () => {
        const filter = new Filter('users').assign();
        const { query } = filter.toSQL();
        expect(query).toContain('SELECT * FROM "users"');
    });

    it('should convert single UUID to id equality', () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        const filter = new Filter('users').assign(uuid);
        const { query, params } = filter.toSQL();

        expect(query).toContain('WHERE');
        expect(query).toContain('id');
        expect(params).toContain(uuid);
    });

    it('should convert array of UUIDs to $in operator', () => {
        const uuids = [
            '123e4567-e89b-12d3-a456-426614174000',
            '223e4567-e89b-12d3-a456-426614174000'
        ];
        const filter = new Filter('users').assign(uuids);
        const { query, params } = filter.toSQL();

        expect(query).toContain('WHERE');
        expect(params).toEqual(expect.arrayContaining(uuids));
    });

    it('should handle empty array (no conditions)', () => {
        const filter = new Filter('users').assign([]);
        const { query } = filter.toSQL();
        // Note: May contain WHERE clause for soft delete filtering
        expect(query).toContain('SELECT * FROM "users"');
    });

    it('should convert plain string to name equality', () => {
        const filter = new Filter('users').assign('john');
        const { query, params } = filter.toSQL();

        expect(query).toContain('WHERE');
        expect(query).toContain('name');
        expect(params).toContain('john');
    });

    it('should handle FilterData object', () => {
        const filter = new Filter('users').assign({
            where: { status: 'active' }
        });
        const { query, params } = filter.toSQL();

        expect(query).toContain('WHERE');
        expect(params).toContain('active');
    });
});

describe('Filter - SELECT Clause', () => {
    it('should select all fields by default', () => {
        const filter = new Filter('users');
        const { query } = filter.toSQL();
        expect(query).toMatch(/^SELECT \* FROM/);
    });

    it('should select specific fields', () => {
        const filter = new Filter('users').assign({
            select: ['id', 'name', 'email']
        });
        const { query } = filter.toSQL();

        expect(query).toContain('"id"');
        expect(query).toContain('"name"');
        expect(query).toContain('"email"');
    });

    it('should handle $select method', () => {
        const filter = new Filter('users').$select('id', 'name');
        const { query } = filter.toSQL();

        expect(query).toContain('"id"');
        expect(query).toContain('"name"');
    });

    it('should handle wildcard select', () => {
        const filter = new Filter('users').assign({
            select: ['*']
        });
        const { query } = filter.toSQL();
        expect(query).toMatch(/^SELECT \* FROM/);
    });

    it('should reject invalid field names', () => {
        expect(() => new Filter('users').assign({
            select: ['name; DROP TABLE users']
        })).toThrow('Invalid field name format');
    });

    it('should reject non-string field names', () => {
        expect(() => new Filter('users').assign({
            select: [123 as any]
        })).toThrow('Select must be an array of field names');
    });
});

describe('Filter - WHERE Clause', () => {
    it('should handle simple equality', () => {
        const filter = new Filter('users').assign({
            where: { status: 'active' }
        });
        const { query, params } = filter.toSQL();

        expect(query).toContain('WHERE');
        expect(params).toContain('active');
    });

    it('should handle multiple conditions with implicit AND', () => {
        const filter = new Filter('users').assign({
            where: {
                status: 'active',
                role: 'admin'
            }
        });
        const { query, params } = filter.toSQL();

        expect(query).toContain('WHERE');
        expect(params).toContain('active');
        expect(params).toContain('admin');
    });

    it('should handle $where method', () => {
        const filter = new Filter('users').$where({ status: 'active' });
        const { query, params } = filter.toSQL();

        expect(query).toContain('WHERE');
        expect(params).toContain('active');
    });

    it('should merge multiple $where calls with $and', () => {
        const filter = new Filter('users')
            .$where({ status: 'active' })
            .$where({ role: 'admin' });
        const { query, params } = filter.toSQL();

        expect(query).toContain('WHERE');
        expect(params).toContain('active');
        expect(params).toContain('admin');
    });
});

describe('Filter - WHERE Operators', () => {
    it('should handle $eq operator', () => {
        const filter = new Filter('users').assign({
            where: { age: { $eq: 25 } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain(25);
    });

    it('should handle $ne operator', () => {
        const filter = new Filter('users').assign({
            where: { status: { $ne: 'deleted' } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('deleted');
    });

    it('should handle $gt operator', () => {
        const filter = new Filter('users').assign({
            where: { age: { $gt: 18 } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain(18);
    });

    it('should handle $gte operator', () => {
        const filter = new Filter('users').assign({
            where: { age: { $gte: 18 } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain(18);
    });

    it('should handle $lt operator', () => {
        const filter = new Filter('users').assign({
            where: { age: { $lt: 65 } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain(65);
    });

    it('should handle $lte operator', () => {
        const filter = new Filter('users').assign({
            where: { age: { $lte: 65 } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain(65);
    });

    it('should handle $in operator', () => {
        const filter = new Filter('users').assign({
            where: { status: { $in: ['active', 'pending'] } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('active');
        expect(params).toContain('pending');
    });

    it('should handle $nin operator', () => {
        const filter = new Filter('users').assign({
            where: { status: { $nin: ['deleted', 'banned'] } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('deleted');
        expect(params).toContain('banned');
    });

    it('should handle $like operator', () => {
        const filter = new Filter('users').assign({
            where: { name: { $like: 'john%' } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('john%');
    });

    it('should handle $ilike operator', () => {
        const filter = new Filter('users').assign({
            where: { name: { $ilike: 'john%' } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('john%');
    });

    it('should handle $between operator', () => {
        const filter = new Filter('users').assign({
            where: { age: { $between: [18, 65] } }
        });
        const { params } = filter.toSQL();
        expect(params).toContain(18);
        expect(params).toContain(65);
    });
});

describe('Filter - Logical Operators', () => {
    it('should handle $and operator', () => {
        const filter = new Filter('users').assign({
            where: {
                $and: [
                    { status: 'active' },
                    { role: 'admin' }
                ]
            }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('active');
        expect(params).toContain('admin');
    });

    it('should handle $or operator', () => {
        const filter = new Filter('users').assign({
            where: {
                $or: [
                    { status: 'active' },
                    { status: 'pending' }
                ]
            }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('active');
        expect(params).toContain('pending');
    });

    it('should handle $not operator', () => {
        const filter = new Filter('users').assign({
            where: {
                $not: { status: 'deleted' }
            }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('deleted');
    });

    it('should handle nested logical operators', () => {
        const filter = new Filter('users').assign({
            where: {
                $and: [
                    {
                        $or: [
                            { status: 'active' },
                            { status: 'pending' }
                        ]
                    },
                    { role: 'admin' }
                ]
            }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('active');
        expect(params).toContain('pending');
        expect(params).toContain('admin');
    });
});

describe('Filter - Array Operators', () => {
    it('should handle $any operator', () => {
        const filter = new Filter('users').assign({
            where: {
                access_read: { $any: ['user-123', 'group-456'] }
            }
        });
        const { params } = filter.toSQL();
        expect(params).toContain('user-123');
        expect(params).toContain('group-456');
    });

    it('should handle $find operator', () => {
        const filter = new Filter('users').assign({
            where: {
                tags: { $find: 'premium' }
            }
        });
        const { params } = filter.toSQL();
        // $find wraps value in wildcards for LIKE search
        expect(params).toContain('%premium%');
    });
});

describe('Filter - ORDER BY Clause', () => {
    it('should handle simple ascending order', () => {
        const filter = new Filter('users').assign({
            order: 'name'
        });
        const { query } = filter.toSQL();
        expect(query).toContain('ORDER BY');
        expect(query).toContain('"name"');
    });

    it('should handle descending order', () => {
        const filter = new Filter('users').assign({
            order: 'created_at desc'
        });
        const { query } = filter.toSQL();
        expect(query).toContain('ORDER BY');
        expect(query).toMatch(/DESC/i);
    });

    it('should handle multiple order fields', () => {
        const filter = new Filter('users').assign({
            order: [
                'status asc',
                'created_at desc'
            ]
        });
        const { query } = filter.toSQL();
        expect(query).toContain('ORDER BY');
        expect(query).toContain('"status"');
        expect(query).toContain('"created_at"');
    });

    it('should handle $order method', () => {
        const filter = new Filter('users').$order('name asc');
        const { query } = filter.toSQL();
        expect(query).toContain('ORDER BY');
        expect(query).toContain('"name"');
    });

    it('should handle object format order', () => {
        const filter = new Filter('users').assign({
            order: { field: 'name', sort: 'asc' }
        });
        const { query } = filter.toSQL();
        expect(query).toContain('ORDER BY');
        expect(query).toContain('"name"');
    });
});

describe('Filter - LIMIT/OFFSET', () => {
    it('should handle limit', () => {
        const filter = new Filter('users').assign({
            limit: 10
        });
        const { query } = filter.toSQL();
        expect(query).toContain('LIMIT 10');
    });

    it('should handle limit with offset', () => {
        const filter = new Filter('users').assign({
            limit: 10,
            offset: 20
        });
        const { query } = filter.toSQL();
        expect(query).toContain('LIMIT 10');
        expect(query).toContain('OFFSET 20');
    });

    it('should handle $limit method', () => {
        const filter = new Filter('users').$limit(5);
        const { query } = filter.toSQL();
        expect(query).toContain('LIMIT 5');
    });

    it('should handle $limit with offset', () => {
        const filter = new Filter('users').$limit(5, 10);
        const { query } = filter.toSQL();
        expect(query).toContain('LIMIT 5');
        expect(query).toContain('OFFSET 10');
    });

    it('should reject negative limit', () => {
        expect(() => new Filter('users').assign({
            limit: -1
        })).toThrow('Limit must be a non-negative integer');
    });

    it('should reject negative offset', () => {
        expect(() => new Filter('users').assign({
            limit: 10,
            offset: -1
        })).toThrow('Offset must be a non-negative integer');
    });

    it('should reject non-integer limit', () => {
        expect(() => new Filter('users').assign({
            limit: 10.5
        })).toThrow('Limit must be a non-negative integer');
    });
});

describe('Filter - SQL Generation', () => {
    it('should generate complete SQL with toSQL()', () => {
        const filter = new Filter('users').assign({
            select: ['id', 'name'],
            where: { status: 'active' },
            order: 'name asc',
            limit: 10
        });
        const { query, params } = filter.toSQL();

        expect(query).toContain('SELECT');
        expect(query).toContain('FROM "users"');
        expect(query).toContain('WHERE');
        expect(query).toContain('ORDER BY');
        expect(query).toContain('LIMIT');
        expect(params.length).toBeGreaterThan(0);
    });

    it('should generate WHERE clause with toWhereSQL()', () => {
        const filter = new Filter('users').assign({
            where: { status: 'active', role: 'admin' }
        });
        const { whereClause, params } = filter.toWhereSQL();

        expect(whereClause).toBeTruthy();
        expect(params).toContain('active');
        expect(params).toContain('admin');
    });

    it('should generate COUNT query with toCountSQL()', () => {
        const filter = new Filter('users').assign({
            where: { status: 'active' }
        });
        const { query, params } = filter.toCountSQL();

        expect(query).toContain('SELECT COUNT(*) as count');
        expect(query).toContain('FROM "users"');
        expect(params).toContain('active');
    });

    it('should generate aggregation query with toAggregateSQL()', () => {
        const filter = new Filter('orders').assign({
            where: { status: 'completed' }
        });
        const { query, params } = filter.toAggregateSQL({
            total: { $sum: 'amount' },
            count: { $count: '*' }
        });

        expect(query).toContain('SELECT');
        expect(query).toContain('SUM("amount")');
        expect(query).toContain('COUNT(*)');
        expect(params).toContain('completed');
    });

    it('should generate aggregation with GROUP BY', () => {
        const filter = new Filter('orders');
        const { query } = filter.toAggregateSQL(
            { total: { $sum: 'amount' } },
            ['status']
        );

        expect(query).toContain('GROUP BY');
        expect(query).toContain('"status"');
    });
});

describe('Filter - Helper Methods', () => {
    it('should get WHERE clause with getWhereClause()', () => {
        const filter = new Filter('users').assign({
            where: { status: 'active' }
        });
        const whereClause = filter.getWhereClause();
        expect(whereClause).toBeTruthy();
    });

    it('should get ORDER clause with getOrderClause()', () => {
        const filter = new Filter('users').assign({
            order: 'name asc'
        });
        const orderClause = filter.getOrderClause();
        expect(orderClause).toContain('"name"');
    });

    it('should get LIMIT clause with getLimitClause()', () => {
        const filter = new Filter('users').assign({
            limit: 10
        });
        const limitClause = filter.getLimitClause();
        expect(limitClause).toBe('LIMIT 10');
    });

    it('should return empty string for undefined limit', () => {
        const filter = new Filter('users');
        const limitClause = filter.getLimitClause();
        expect(limitClause).toBe('');
    });
});

describe('Filter - Edge Cases', () => {
    it('should handle empty WHERE conditions', () => {
        const filter = new Filter('users').assign({ where: {} });
        const { query } = filter.toSQL();
        // Note: May contain WHERE clause for soft delete filtering (trashed_at, deleted_at)
        expect(query).toContain('SELECT * FROM "users"');
    });

    it('should handle null values in WHERE', () => {
        const filter = new Filter('users').assign({
            where: { deleted_at: null }
        });
        const { query } = filter.toSQL();
        expect(query).toContain('WHERE');
    });

    it('should handle chained method calls', () => {
        const filter = new Filter('users')
            .$select('id', 'name')
            .$where({ status: 'active' })
            .$order('name asc')
            .$limit(10);

        const { query, params } = filter.toSQL();
        expect(query).toContain('SELECT');
        expect(query).toContain('WHERE');
        expect(query).toContain('ORDER BY');
        expect(query).toContain('LIMIT');
        expect(params).toContain('active');
    });

    it('should handle soft delete options', () => {
        const filter = new Filter('users')
            .assign({ where: { status: 'active' } })
            .withSoftDeleteOptions({ trashed: 'exclude' });

        const { query } = filter.toSQL();
        expect(query).toContain('WHERE');
        expect(query).toContain('"trashed_at" IS NULL');
        expect(query).toContain('"deleted_at" IS NULL');
    });
});
