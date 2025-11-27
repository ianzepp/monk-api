import { describe, it, expect } from 'vitest';
import { FilterSqlGenerator, type FilterState } from '@src/lib/filter-sql-generator.js';
import type { FilterOrderInfo, AggregateSpec } from '@src/lib/filter-types.js';

describe('FilterSqlGenerator - toSQL()', () => {
    it('should generate simple SELECT query', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toSQL(state);

        expect(query).toContain('SELECT *');
        expect(query).toContain('FROM "users"');
        expect(params).toEqual([]);
    });

    it('should generate SELECT with specific fields', () => {
        const state: FilterState = {
            tableName: 'users',
            select: ['id', 'name', 'email'],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toSQL(state);

        expect(query).toContain('SELECT "id", "name", "email"');
        expect(query).toContain('FROM "users"');
        expect(params).toEqual([]);
    });

    it('should generate SELECT with WHERE clause', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: { status: 'active' },
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toSQL(state);

        expect(query).toContain('SELECT *');
        expect(query).toContain('FROM "users"');
        expect(query).toContain('WHERE');
        expect(params).toContain('active');
    });

    it('should generate SELECT with ORDER BY', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [{ field: 'name', sort: 'asc' }],
            accessUserIds: [],
            trashedOption: { trashed: 'include' }
        };

        const { query, params } = FilterSqlGenerator.toSQL(state);

        expect(query).toContain('SELECT *');
        expect(query).toContain('FROM "users"');
        expect(query).toContain('ORDER BY');
        expect(params).toEqual([]);
    });

    it('should generate SELECT with LIMIT', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            limit: 10,
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toSQL(state);

        expect(query).toContain('SELECT *');
        expect(query).toContain('FROM "users"');
        expect(query).toContain('LIMIT 10');
        expect(params).toEqual([]);
    });

    it('should generate SELECT with LIMIT and OFFSET', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            limit: 10,
            offset: 20,
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toSQL(state);

        expect(query).toContain('SELECT *');
        expect(query).toContain('FROM "users"');
        expect(query).toContain('LIMIT 10');
        expect(query).toContain('OFFSET 20');
        expect(params).toEqual([]);
    });

    it('should generate complete SELECT with all clauses', () => {
        const state: FilterState = {
            tableName: 'users',
            select: ['id', 'name'],
            whereData: { status: 'active' },
            order: [{ field: 'name', sort: 'asc' }],
            limit: 10,
            offset: 5,
            accessUserIds: [],
            trashedOption: { trashed: 'include' }
        };

        const { query, params } = FilterSqlGenerator.toSQL(state);

        expect(query).toContain('SELECT "id", "name"');
        expect(query).toContain('FROM "users"');
        expect(query).toContain('WHERE');
        expect(query).toContain('ORDER BY');
        expect(query).toContain('LIMIT 10');
        expect(query).toContain('OFFSET 5');
        expect(params).toContain('active');
    });

    it('should handle wildcard in select array', () => {
        const state: FilterState = {
            tableName: 'users',
            select: ['*'],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toSQL(state);

        expect(query).toContain('SELECT *');
        expect(query).toContain('FROM "users"');
        expect(params).toEqual([]);
    });
});

describe('FilterSqlGenerator - toWhereSQL()', () => {
    it('should generate WHERE clause with simple equality', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: { status: 'active' },
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { whereClause, params } = FilterSqlGenerator.toWhereSQL(state);

        expect(whereClause).toBeTruthy();
        expect(params).toContain('active');
    });

    it('should generate WHERE clause with multiple conditions', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: { status: 'active', role: 'admin' },
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { whereClause, params } = FilterSqlGenerator.toWhereSQL(state);

        expect(whereClause).toBeTruthy();
        expect(params).toContain('active');
        expect(params).toContain('admin');
    });

    it('should return empty WHERE clause for empty whereData', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { whereClause, params } = FilterSqlGenerator.toWhereSQL(state);

        // May have soft delete clause
        expect(params).toEqual([]);
    });

    it('should handle soft delete options', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: { trashed: 'exclude' }
        };

        const { whereClause, params } = FilterSqlGenerator.toWhereSQL(state);

        expect(whereClause).toBeTruthy();
        expect(params).toEqual([]);
    });
});

describe('FilterSqlGenerator - toCountSQL()', () => {
    it('should generate COUNT query', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toCountSQL(state);

        expect(query).toContain('SELECT COUNT(*) as count');
        expect(query).toContain('FROM "users"');
        expect(params).toEqual([]);
    });

    it('should generate COUNT query with WHERE clause', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: { status: 'active' },
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toCountSQL(state);

        expect(query).toContain('SELECT COUNT(*) as count');
        expect(query).toContain('FROM "users"');
        expect(query).toContain('WHERE');
        expect(params).toContain('active');
    });

    it('should not include ORDER BY in COUNT query', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [{ field: 'name', sort: 'asc' }],
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toCountSQL(state);

        expect(query).toContain('SELECT COUNT(*) as count');
        expect(query).not.toContain('ORDER BY');
        expect(params).toEqual([]);
    });

    it('should not include LIMIT/OFFSET in COUNT query', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            limit: 10,
            offset: 5,
            accessUserIds: [],
            trashedOption: {}
        };

        const { query, params } = FilterSqlGenerator.toCountSQL(state);

        expect(query).toContain('SELECT COUNT(*) as count');
        expect(query).not.toContain('LIMIT');
        expect(query).not.toContain('OFFSET');
        expect(params).toEqual([]);
    });
});

describe('FilterSqlGenerator - toAggregateSQL()', () => {
    it('should generate SUM aggregation', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            total: { $sum: 'amount' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('SELECT');
        expect(query).toContain('SUM("amount") as "total"');
        expect(query).toContain('FROM "orders"');
        expect(params).toEqual([]);
    });

    it('should generate AVG aggregation', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            avg_amount: { $avg: 'amount' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('AVG("amount") as "avg_amount"');
        expect(params).toEqual([]);
    });

    it('should generate MIN aggregation', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            min_amount: { $min: 'amount' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('MIN("amount") as "min_amount"');
        expect(params).toEqual([]);
    });

    it('should generate MAX aggregation', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            max_amount: { $max: 'amount' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('MAX("amount") as "max_amount"');
        expect(params).toEqual([]);
    });

    it('should generate COUNT aggregation', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            order_count: { $count: 'id' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('COUNT("id") as "order_count"');
        expect(params).toEqual([]);
    });

    it('should generate COUNT(*) aggregation', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            total_count: { $count: '*' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('COUNT(*) as "total_count"');
        expect(params).toEqual([]);
    });

    it('should generate DISTINCT aggregation', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            unique_customers: { $distinct: 'customer_id' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('COUNT(DISTINCT "customer_id") as "unique_customers"');
        expect(params).toEqual([]);
    });

    it('should generate multiple aggregations', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            total: { $sum: 'amount' },
            avg: { $avg: 'amount' },
            count: { $count: '*' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('SUM("amount") as "total"');
        expect(query).toContain('AVG("amount") as "avg"');
        expect(query).toContain('COUNT(*) as "count"');
        expect(params).toEqual([]);
    });

    it('should generate aggregation with GROUP BY', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            total: { $sum: 'amount' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations, ['customer_id']);

        expect(query).toContain('SELECT "customer_id"');
        expect(query).toContain('SUM("amount") as "total"');
        expect(query).toContain('FROM "orders"');
        expect(query).toContain('GROUP BY "customer_id"');
        expect(params).toEqual([]);
    });

    it('should generate aggregation with multiple GROUP BY fields', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            total: { $sum: 'amount' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(
            state,
            aggregations,
            ['customer_id', 'status']
        );

        expect(query).toContain('SELECT "customer_id", "status"');
        expect(query).toContain('SUM("amount") as "total"');
        expect(query).toContain('GROUP BY "customer_id", "status"');
        expect(params).toEqual([]);
    });

    it('should generate aggregation with WHERE clause', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: { status: 'completed' },
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            total: { $sum: 'amount' }
        };

        const { query, params } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('SUM("amount") as "total"');
        expect(query).toContain('WHERE');
        expect(params).toContain('completed');
    });

    it('should throw error for empty aggregations', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {};

        expect(() => {
            FilterSqlGenerator.toAggregateSQL(state, aggregations);
        }).toThrow('At least one aggregation function required');
    });

    it('should throw error for unknown aggregation function', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations = {
            invalid: { $invalid: 'amount' }
        } as any;

        expect(() => {
            FilterSqlGenerator.toAggregateSQL(state, aggregations);
        }).toThrow('Unknown aggregation function');
    });
});

describe('FilterSqlGenerator - getWhereClause()', () => {
    it('should return WHERE clause conditions', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: { status: 'active' },
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const whereClause = FilterSqlGenerator.getWhereClause(state);

        expect(whereClause).toBeTruthy();
        expect(typeof whereClause).toBe('string');
    });

    it('should return 1=1 for empty WHERE with all soft delete disabled', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: { trashed: 'include' }
        };

        const whereClause = FilterSqlGenerator.getWhereClause(state);

        // Should only have deleted_at filter, not trashed_at
        expect(whereClause).toContain('"deleted_at" IS NULL');
    });
});

describe('FilterSqlGenerator - getOrderClause()', () => {
    it('should return ORDER BY clause without prefix', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [{ field: 'name', sort: 'asc' }],
            accessUserIds: [],
            trashedOption: {}
        };

        const orderClause = FilterSqlGenerator.getOrderClause(state);

        expect(orderClause).toBeTruthy();
        expect(orderClause).not.toContain('ORDER BY');
        expect(typeof orderClause).toBe('string');
    });

    it('should return empty string for no order', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const orderClause = FilterSqlGenerator.getOrderClause(state);

        expect(orderClause).toBe('');
    });
});

describe('FilterSqlGenerator - getLimitClause()', () => {
    it('should return LIMIT clause', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            limit: 10,
            accessUserIds: [],
            trashedOption: {}
        };

        const limitClause = FilterSqlGenerator.getLimitClause(state);

        expect(limitClause).toBe('LIMIT 10');
    });

    it('should return LIMIT with OFFSET', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            limit: 10,
            offset: 20,
            accessUserIds: [],
            trashedOption: {}
        };

        const limitClause = FilterSqlGenerator.getLimitClause(state);

        expect(limitClause).toBe('LIMIT 10 OFFSET 20');
    });

    it('should return empty string for no limit', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const limitClause = FilterSqlGenerator.getLimitClause(state);

        expect(limitClause).toBe('');
    });

    it('should ignore offset without limit', () => {
        const state: FilterState = {
            tableName: 'users',
            select: [],
            whereData: {},
            order: [],
            offset: 20,
            accessUserIds: [],
            trashedOption: {}
        };

        const limitClause = FilterSqlGenerator.getLimitClause(state);

        expect(limitClause).toBe('');
    });
});

describe('FilterSqlGenerator - Field Validation', () => {
    it('should throw error for invalid field name in aggregation', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            'invalid; DROP TABLE': { $sum: 'amount' }
        };

        expect(() => {
            FilterSqlGenerator.toAggregateSQL(state, aggregations);
        }).toThrow('Invalid field name format');
    });

    it('should throw error for invalid field name in GROUP BY', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            total: { $sum: 'amount' }
        };

        expect(() => {
            FilterSqlGenerator.toAggregateSQL(state, aggregations, ['invalid; DROP TABLE']);
        }).toThrow('Invalid field name format');
    });

    it('should accept valid field names with underscores', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            total_amount: { $sum: 'order_amount' }
        };

        const { query } = FilterSqlGenerator.toAggregateSQL(state, aggregations, ['customer_id']);

        expect(query).toContain('SUM("order_amount") as "total_amount"');
        expect(query).toContain('GROUP BY "customer_id"');
    });

    it('should accept field names starting with letter', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            a1: { $sum: 'b2' }
        };

        const { query } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('SUM("b2") as "a1"');
    });

    it('should accept field names starting with underscore', () => {
        const state: FilterState = {
            tableName: 'orders',
            select: [],
            whereData: {},
            order: [],
            accessUserIds: [],
            trashedOption: {}
        };

        const aggregations: AggregateSpec = {
            _private: { $sum: '_amount' }
        };

        const { query } = FilterSqlGenerator.toAggregateSQL(state, aggregations);

        expect(query).toContain('SUM("_amount") as "_private"');
    });
});
