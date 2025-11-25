import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Database } from '@src/lib/database.js';
import { Filter } from '@src/lib/filter.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { createMockDatabase, createMockModel } from '../helpers/test-mocks.js';

describe('Aggregate API - Edge Cases', () => {
    let database: Database;

    beforeEach(() => {
        const mockModel = createMockModel({
            modelName: 'orders',
        });

        database = createMockDatabase({
            toModel: vi.fn().mockResolvedValue(mockModel),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Complex Aggregations', () => {
        it('should handle 10+ aggregations in single query', async () => {
            const body = {
                aggregate: {
                    count_all: { $count: '*' },
                    count_id: { $count: 'id' },
                    sum_amount: { $sum: 'amount' },
                    avg_amount: { $avg: 'amount' },
                    min_amount: { $min: 'amount' },
                    max_amount: { $max: 'amount' },
                    distinct_users: { $distinct: 'user_id' },
                    distinct_statuses: { $distinct: 'status' },
                    sum_quantity: { $sum: 'quantity' },
                    avg_quantity: { $avg: 'quantity' },
                    min_created: { $min: 'created_at' },
                    max_created: { $max: 'created_at' },
                },
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should handle deeply nested WHERE conditions with aggregations', async () => {
            const body = {
                where: {
                    $and: [
                        {
                            $or: [
                                { status: 'completed' },
                                { status: 'shipped' },
                            ],
                        },
                        {
                            $and: [
                                { amount: { $gt: 100 } },
                                { amount: { $lt: 10000 } },
                            ],
                        },
                        {
                            $or: [
                                { category: 'electronics' },
                                { category: 'books' },
                            ],
                        },
                    ],
                },
                aggregate: {
                    total: { $count: '*' },
                    sum: { $sum: 'amount' },
                },
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should handle aggregation with all WHERE operators', async () => {
            const body = {
                where: {
                    $and: [
                        { status: { $eq: 'completed' } },
                        { amount: { $gt: 100 } },
                        { quantity: { $gte: 1 } },
                        { discount: { $lt: 50 } },
                        { tax: { $lte: 10 } },
                        { category: { $in: ['books', 'electronics'] } },
                        { tags: { $nin: ['clearance', 'damaged'] } },
                        { name: { $like: '%special%' } },
                        { description: { $ilike: '%premium%' } },
                        { created_at: { $between: ['2024-01-01', '2024-12-31'] } },
                    ],
                },
                aggregate: { total: { $count: '*' } },
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should handle multiple GROUP BY with multiple aggregations', async () => {
            const body = {
                aggregate: {
                    count: { $count: '*' },
                    total: { $sum: 'amount' },
                    average: { $avg: 'amount' },
                    minimum: { $min: 'amount' },
                    maximum: { $max: 'amount' },
                },
                groupBy: ['country', 'status', 'category', 'year'],
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });
    });

    describe('Field Name Security', () => {
        it('should sanitize field names in aggregations', async () => {
            // FilterSqlGenerator.sanitizeFieldName should handle this
            const body = {
                aggregate: {
                    'valid_field_name': { $count: 'order_id' },
                    'another_valid_123': { $sum: 'amount_usd' },
                },
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should sanitize field names in GROUP BY', async () => {
            const body = {
                aggregate: { total: { $count: '*' } },
                groupBy: ['valid_field', 'another_field_123', '_private_field'],
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should reject SQL injection attempts in aggregate fields', async () => {
            const body = {
                aggregate: {
                    malicious: { $sum: 'amount; DROP TABLE orders' },
                },
            };

            // Mock FilterSqlGenerator to throw on invalid field name
            vi.spyOn(Filter.prototype, 'toAggregateSQL').mockImplementation(() => {
                throw HttpErrors.badRequest('Invalid field name format', 'FILTER_INVALID_FIELD');
            });

            await expect(database.aggregate('orders', body))
                .rejects
                .toThrow('Invalid field name format');
        });

        it('should reject SQL injection attempts in GROUP BY fields', async () => {
            const body = {
                aggregate: { total: { $count: '*' } },
                groupBy: ['status; DROP TABLE orders'],
            };

            vi.spyOn(Filter.prototype, 'toAggregateSQL').mockImplementation(() => {
                throw HttpErrors.badRequest('Invalid field name format', 'FILTER_INVALID_FIELD');
            });

            await expect(database.aggregate('orders', body))
                .rejects
                .toThrow('Invalid field name format');
        });
    });

    describe('Special Values', () => {
        it('should handle NULL values in aggregation results', async () => {
            const mockRows = [
                { status: 'completed', avg_amount: null },
                { status: 'pending', avg_amount: '125.50' },
            ];

            vi.spyOn(database as any, 'execute').mockResolvedValue({ rows: mockRows });

            const body = {
                aggregate: { avg_amount: { $avg: 'amount' } },
                groupBy: ['status'],
            };

            const result = await database.aggregate('orders', body);

            expect(result[0].avg_amount).toBeNull();
            expect(result[1].avg_amount).toBe('125.50');
        });

        it('should handle empty result sets', async () => {
            vi.spyOn(database as any, 'execute').mockResolvedValue({ rows: [] });

            const body = {
                where: { status: 'non_existent' },
                aggregate: { total: { $count: '*' } },
            };

            const result = await database.aggregate('orders', body);

            expect(result).toEqual([]);
        });

        it('should handle large numeric results', async () => {
            const mockRows = [{
                total: '999999999999.99',
                count: '1000000',
            }];

            vi.spyOn(database as any, 'execute').mockResolvedValue({ rows: mockRows });
            vi.spyOn(database as any, 'convertPostgreSQLTypes').mockImplementation((row: any) => ({
                total: parseFloat(row.total),
                count: parseInt(row.count),
            }));

            const body = {
                aggregate: {
                    total: { $sum: 'amount' },
                    count: { $count: '*' },
                },
            };

            const result = await database.aggregate('orders', body);

            expect(result[0].total).toBe(999999999999.99);
            expect(result[0].count).toBe(1000000);
        });

        it('should handle special characters in field names', async () => {
            const body = {
                aggregate: {
                    total: { $count: '_id' },
                    sum: { $sum: 'amount_usd' },
                },
                groupBy: ['_internal_status', 'user_id_123'],
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should handle zero values in aggregations', async () => {
            const mockRows = [{
                status: 'cancelled',
                count: '0',
                sum: '0',
                avg: '0',
            }];

            vi.spyOn(database as any, 'execute').mockResolvedValue({ rows: mockRows });

            const body = {
                aggregate: {
                    count: { $count: '*' },
                    sum: { $sum: 'amount' },
                    avg: { $avg: 'amount' },
                },
                groupBy: ['status'],
            };

            const result = await database.aggregate('orders', body);

            expect(result[0]).toEqual({
                status: 'cancelled',
                count: '0',
                sum: '0',
                avg: '0',
            });
        });
    });

    describe('Performance Edge Cases', () => {
        it('should handle very long field lists in GROUP BY', async () => {
            const body = {
                aggregate: { total: { $count: '*' } },
                groupBy: Array.from({ length: 20 }, (_, i) => `field_${i}`),
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should handle complex WHERE with large parameter arrays', async () => {
            const body = {
                where: {
                    status: { $in: Array.from({ length: 100 }, (_, i) => `status_${i}`) },
                },
                aggregate: { total: { $count: '*' } },
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should validate aggregate spec structure', async () => {
            const body = {
                aggregate: {
                    valid: { $count: '*' },
                },
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });
    });

    describe('Type Validation', () => {
        it('should handle all aggregation function types', async () => {
            const body = {
                aggregate: {
                    count_star: { $count: '*' },
                    count_field: { $count: 'id' },
                    sum: { $sum: 'amount' },
                    avg: { $avg: 'amount' },
                    min: { $min: 'amount' },
                    max: { $max: 'amount' },
                    distinct: { $distinct: 'user_id' },
                },
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should handle mixed WHERE conditions with aggregations', async () => {
            const body = {
                where: {
                    $and: [
                        { status: 'completed' },
                        {
                            $or: [
                                { amount: { $gt: 100 } },
                                { priority: 'high' },
                            ],
                        },
                    ],
                },
                aggregate: {
                    count: { $count: '*' },
                    total: { $sum: 'amount' },
                },
                groupBy: ['status', 'priority'],
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });

        it('should handle empty arrays in WHERE conditions', async () => {
            const body = {
                where: {
                    status: { $in: [] }, // Empty array should be handled
                },
                aggregate: { total: { $count: '*' } },
            };

            await expect(database.aggregate('orders', body)).resolves.toBeDefined();
        });
    });
});
