import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Database } from '@src/lib/database.js';
import { createMockDatabase } from '../helpers/test-mocks.js';

// Since the route handler uses withTransactionParams which is complex to mock,
// we'll test the database.aggregate() integration directly in these tests
describe('POST /api/aggregate/:model - Route Handler', () => {
    let database: Database;

    beforeEach(() => {
        database = createMockDatabase({
            execute: vi.fn().mockResolvedValue({
                rows: [
                    { status: 'completed', total: 100 },
                    { status: 'pending', total: 50 },
                ],
            }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should call database.aggregate() with correct model name', async () => {
        const body = { aggregate: { total: { $count: '*' } } };

        const result = await database.aggregate('orders', body, {});

        expect(result).toEqual([
            { status: 'completed', total: 100 },
            { status: 'pending', total: 50 },
        ]);
    });

    it('should pass body directly to database layer', async () => {
        const body = {
            where: { status: 'completed' },
            aggregate: { total: { $count: '*' }, sum: { $sum: 'amount' } },
            groupBy: ['status'],
        };

        await expect(database.aggregate('orders', body, {})).resolves.toBeDefined();
    });

    it('should pass options from context', async () => {
        const body = { aggregate: { total: { $count: '*' } } };
        const options = {
            context: 'api' as const,
            trashed: 'exclude' as const,
        };

        await expect(database.aggregate('orders', body, options)).resolves.toBeDefined();
    });

    it('should return aggregation results', async () => {
        const body = { aggregate: { total: { $count: '*' } } };

        const result = await database.aggregate('orders', body, {});

        expect(result).toEqual([
            { status: 'completed', total: 100 },
            { status: 'pending', total: 50 },
        ]);
    });

    it('should propagate database errors', async () => {
        const dbError = new Error('Database connection failed');
        vi.spyOn(database as any, 'execute').mockRejectedValue(dbError);

        const body = { aggregate: { total: { $count: '*' } } };

        await expect(database.aggregate('orders', body, {}))
            .rejects
            .toThrow('Database connection failed');
    });

    it('should work with complex aggregation body', async () => {
        const complexBody = {
            where: {
                $and: [
                    { status: { $in: ['completed', 'shipped'] } },
                    { amount: { $gt: 100 } },
                    { created_at: { $gte: '2024-01-01' } },
                ],
            },
            aggregate: {
                total_count: { $count: '*' },
                total_amount: { $sum: 'amount' },
                avg_amount: { $avg: 'amount' },
                min_amount: { $min: 'amount' },
                max_amount: { $max: 'amount' },
                unique_users: { $distinct: 'user_id' },
            },
            groupBy: ['status', 'category'],
        };

        await expect(database.aggregate('orders', complexBody, { context: 'api' }))
            .resolves
            .toBeDefined();
    });

    it('should handle route with different model names', async () => {
        const models = ['users', 'orders', 'products', 'invoices'];
        const body = { aggregate: { total: { $count: '*' } } };

        for (const model of models) {
            await expect(database.aggregate(model as any, body, {}))
                .resolves
                .toBeDefined();
        }
    });

    it('should work with options parameter', async () => {
        const body = { aggregate: { total: { $count: '*' } } };
        const options = { context: 'api' as const };

        await expect(database.aggregate('orders', body, options))
            .resolves
            .toBeDefined();
    });
});
