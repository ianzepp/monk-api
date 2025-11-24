import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BulkProcessor, BulkOperationType } from '@src/lib/bulk-processor.js';
import { Database } from '@src/lib/database.js';
import { createMockSystem, createMockDatabase } from '../helpers/test-mocks.js';

describe('BulkProcessor - Aggregate Operations', () => {
    let bulkProcessor: BulkProcessor;
    let database: Database;
    let aggregateSpy: any;

    beforeEach(() => {
        database = createMockDatabase({
            execute: vi.fn().mockResolvedValue({ rows: [{ total: 100 }] }),
        });

        const mockSystem = createMockSystem({ database });

        // Spy on database.aggregate to verify body building
        aggregateSpy = vi.spyOn(database, 'aggregate');

        bulkProcessor = new BulkProcessor(mockSystem);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Body Building', () => {
        it('should build body with aggregate field', async () => {
            const requestBody = {
                operations: [{
                    operation: BulkOperationType.Aggregate,
                    model: 'orders',
                    aggregate: { total: { $count: '*' } },
                }],
            };

            await bulkProcessor.process(requestBody);

            expect(aggregateSpy).toHaveBeenCalledWith(
                'orders',
                expect.objectContaining({
                    aggregate: { total: { $count: '*' } },
                }),
            );
        });

        it('should include where from op.where', async () => {
            const requestBody = {
                operations: [{
                    operation: BulkOperationType.Aggregate,
                    model: 'orders',
                    where: { status: 'completed' },
                    aggregate: { total: { $count: '*' } },
                }],
            };

            await bulkProcessor.process(requestBody);

            expect(aggregateSpy).toHaveBeenCalledWith(
                'orders',
                expect.objectContaining({
                    where: { status: 'completed' },
                    aggregate: { total: { $count: '*' } },
                }),
            );
        });

        it('should convert string groupBy to array', async () => {
            const requestBody = {
                operations: [{
                    operation: BulkOperationType.Aggregate,
                    model: 'orders',
                    aggregate: { total: { $count: '*' } },
                    groupBy: 'status',
                }],
            };

            await bulkProcessor.process(requestBody);

            expect(aggregateSpy).toHaveBeenCalledWith(
                'orders',
                expect.objectContaining({
                    groupBy: ['status'],
                }),
            );
        });

        it('should pass array groupBy as-is', async () => {
            const requestBody = {
                operations: [{
                    operation: BulkOperationType.Aggregate,
                    model: 'orders',
                    aggregate: { total: { $count: '*' } },
                    groupBy: ['status', 'user_id'],
                }],
            };

            await bulkProcessor.process(requestBody);

            expect(aggregateSpy).toHaveBeenCalledWith(
                'orders',
                expect.objectContaining({
                    groupBy: ['status', 'user_id'],
                }),
            );
        });

        it('should handle missing groupBy', async () => {
            const requestBody = {
                operations: [{
                    operation: BulkOperationType.Aggregate,
                    model: 'orders',
                    aggregate: { total: { $count: '*' } },
                }],
            };

            await bulkProcessor.process(requestBody);

            expect(aggregateSpy).toHaveBeenCalledWith(
                'orders',
                expect.objectContaining({
                    aggregate: { total: { $count: '*' } },
                }),
            );

            // Should not include groupBy in body
            const callArgs = aggregateSpy.mock.calls[0];
            expect(callArgs[1]).not.toHaveProperty('groupBy');
        });
    });

    describe('Integration', () => {
        it('should call database.aggregate() with built body', async () => {
            const requestBody = {
                operations: [{
                    operation: BulkOperationType.Aggregate,
                    model: 'orders',
                    where: { amount: { $gt: 100 } },
                    aggregate: {
                        total: { $count: '*' },
                        sum: { $sum: 'amount' },
                    },
                    groupBy: ['status'],
                }],
            };

            await bulkProcessor.process(requestBody);

            expect(aggregateSpy).toHaveBeenCalledWith(
                'orders',
                expect.objectContaining({
                    where: { amount: { $gt: 100 } },
                    aggregate: {
                        total: { $count: '*' },
                        sum: { $sum: 'amount' },
                    },
                    groupBy: ['status'],
                }),
            );
        });

        it('should return aggregation results in bulk response', async () => {
            const mockResults = [
                { status: 'completed', total: 100, sum: 50000 },
                { status: 'pending', total: 50, sum: 25000 },
            ];

            vi.spyOn(database as any, 'execute').mockResolvedValue({ rows: mockResults });

            const requestBody = {
                operations: [{
                    operation: BulkOperationType.Aggregate,
                    model: 'orders',
                    aggregate: { total: { $count: '*' }, sum: { $sum: 'amount' } },
                    groupBy: ['status'],
                }],
            };

            const result = await bulkProcessor.process(requestBody);

            expect(result[0].result).toEqual(mockResults);
        });

        it('should work with complex aggregations', async () => {
            const requestBody = {
                operations: [{
                    operation: BulkOperationType.Aggregate,
                    model: 'orders',
                    where: {
                        $and: [
                            { status: { $in: ['completed', 'shipped'] } },
                            { amount: { $between: [100, 1000] } },
                        ],
                    },
                    aggregate: {
                        count: { $count: '*' },
                        total: { $sum: 'amount' },
                        average: { $avg: 'amount' },
                        minimum: { $min: 'amount' },
                        maximum: { $max: 'amount' },
                        unique_users: { $distinct: 'user_id' },
                    },
                    groupBy: ['status', 'category'],
                }],
            };

            await bulkProcessor.process(requestBody);

            expect(aggregateSpy).toHaveBeenCalledWith(
                'orders',
                expect.objectContaining({
                    where: {
                        $and: [
                            { status: { $in: ['completed', 'shipped'] } },
                            { amount: { $between: [100, 1000] } },
                        ],
                    },
                    aggregate: expect.any(Object),
                    groupBy: ['status', 'category'],
                }),
            );
        });
    });
});
