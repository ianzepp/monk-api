import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Database } from '@src/lib/database.js';
import { createMockDatabase } from '../helpers/test-mocks.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /api/data/:model/:record - Route Handler Unit Tests
 *
 * Tests the route handler logic for retrieving a single record by ID.
 * Focuses on:
 * - Database method calls (database.select404)
 * - 404 error handling when record not found
 * - Proper parameter passing (model name, record ID, options)
 */
describe('GET /api/data/:model/:record - Route Handler', () => {
    let database: Database;
    let select404Spy: any;

    beforeEach(() => {
        database = createMockDatabase({
            execute: vi.fn().mockResolvedValue({
                rows: [
                    {
                        id: '123e4567-e89b-12d3-a456-426614174000',
                        name: 'Widget',
                        price: 29.99,
                        created_at: '2024-01-01T00:00:00.000Z',
                        updated_at: '2024-01-01T00:00:00.000Z',
                    },
                ],
            }),
        });

        // Spy on database.select404 to verify route calls it correctly
        select404Spy = vi.spyOn(database, 'select404');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Database Integration', () => {
        it('should call database.select404() with model name and record ID', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';

            const mockRecord = {
                id: recordId,
                name: 'Widget',
                price: 29.99,
            };

            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            await database.select404(modelName as any, { where: { id: recordId } });

            expect(select404Spy).toHaveBeenCalledWith(
                modelName,
                { where: { id: recordId } },
                undefined,
                undefined
            );
        });

        it('should pass options from context to select404', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const options = {
                context: 'api' as const,
                trashed: 'exclude' as const,
            };

            const mockRecord = { id: recordId, name: 'Widget' };
            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            await database.select404(modelName as any, { where: { id: recordId } }, undefined, options);

            expect(select404Spy).toHaveBeenCalledWith(
                modelName,
                { where: { id: recordId } },
                undefined,
                options
            );
        });

        it('should return single record object (not array)', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                price: 29.99,
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-01T00:00:00.000Z',
            };

            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            const result = await database.select404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result).toEqual(mockRecord);
            expect(Array.isArray(result)).toBe(false);
        });

        it('should include all system fields in response', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-01T00:00:00.000Z',
                trashed_at: null,
                deleted_at: null,
            };

            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            const result = await database.select404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('created_at');
            expect(result).toHaveProperty('updated_at');
            expect(result).toHaveProperty('trashed_at');
            expect(result).toHaveProperty('deleted_at');
        });
    });

    describe('Error Handling', () => {
        it('should throw 404 error when record not found', async () => {
            const recordId = '123e4567-e89b-12d3-a456-426614174999';

            vi.spyOn(database, 'select404').mockRejectedValue(
                HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND')
            );

            await expect(
                database.select404('products' as any, { where: { id: recordId } })
            ).rejects.toThrow('Record not found');
        });

        it('should propagate database errors', async () => {
            const dbError = new Error('Database connection failed');
            vi.spyOn(database, 'select404').mockRejectedValue(dbError);

            await expect(
                database.select404('products' as any, {
                    where: { id: '123e4567-e89b-12d3-a456-426614174000' },
                })
            ).rejects.toThrow('Database connection failed');
        });

        it('should throw error for invalid UUID format', async () => {
            const invalidId = 'not-a-uuid';

            vi.spyOn(database, 'select404').mockRejectedValue(
                HttpErrors.badRequest('Invalid UUID format', 'INVALID_UUID')
            );

            await expect(
                database.select404('products' as any, { where: { id: invalidId } })
            ).rejects.toThrow('Invalid UUID format');
        });

        it('should throw error when model not found', async () => {
            const modelError = HttpErrors.notFound('Model not found', 'MODEL_NOT_FOUND');
            vi.spyOn(database, 'select404').mockRejectedValue(modelError);

            await expect(
                database.select404('nonexistent' as any, {
                    where: { id: '123e4567-e89b-12d3-a456-426614174000' },
                })
            ).rejects.toThrow('Model not found');
        });
    });

    describe('Record ID Handling', () => {
        it('should work with different valid UUIDs', async () => {
            const uuids = [
                '123e4567-e89b-12d3-a456-426614174000',
                '223e4567-e89b-12d3-a456-426614174001',
                '323e4567-e89b-12d3-a456-426614174002',
            ];

            for (const uuid of uuids) {
                const mockRecord = { id: uuid, name: 'Test' };
                vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

                const result = await database.select404('products' as any, { where: { id: uuid } });

                expect(result.id).toBe(uuid);
            }
        });

        it('should pass record ID in where clause', async () => {
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const mockRecord = { id: recordId, name: 'Widget' };

            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            await database.select404('products' as any, { where: { id: recordId } });

            expect(select404Spy).toHaveBeenCalledWith(
                'products',
                expect.objectContaining({
                    where: { id: recordId },
                }),
                undefined,
                undefined
            );
        });
    });

    describe('Model Name Handling', () => {
        it('should work with different model names', async () => {
            const models = ['users', 'orders', 'products', 'invoices'];
            const recordId = '123e4567-e89b-12d3-a456-426614174000';

            for (const model of models) {
                const mockRecord = { id: recordId, name: 'Test' };
                vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

                await database.select404(model as any, { where: { id: recordId } });
            }

            expect(select404Spy).toHaveBeenCalledTimes(models.length);
        });

        it('should pass model name exactly as provided', async () => {
            const modelName = 'custom_model_name';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const mockRecord = { id: recordId };

            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            await database.select404(modelName as any, { where: { id: recordId } });

            expect(select404Spy).toHaveBeenCalledWith(
                modelName,
                expect.any(Object),
                undefined,
                undefined
            );
        });
    });

    describe('Data Types', () => {
        it('should return records with various data types', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                price: 29.99,
                quantity: 100,
                in_stock: true,
                tags: ['electronics', 'gadgets'],
                metadata: { color: 'blue', size: 'large' },
                description: null,
            };

            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            const result = await database.select404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result.name).toBe('Widget');
            expect(result.price).toBe(29.99);
            expect(result.quantity).toBe(100);
            expect(result.in_stock).toBe(true);
            expect(result.tags).toEqual(['electronics', 'gadgets']);
            expect(result.metadata).toEqual({ color: 'blue', size: 'large' });
            expect(result.description).toBeNull();
        });

        it('should handle records with null fields', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                description: null,
                optional_field: null,
            };

            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            const result = await database.select404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result.description).toBeNull();
            expect(result.optional_field).toBeNull();
        });
    });
});
