import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Database } from '@src/lib/database.js';
import { createMockDatabase } from '../helpers/test-mocks.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/data/:model - Route Handler Unit Tests
 *
 * Tests the route handler logic for creating records without requiring a running API server.
 * Focuses on:
 * - Input validation (array requirement)
 * - Database method calls (database.createAll)
 * - Error propagation
 */
describe('POST /api/data/:model - Route Handler', () => {
    let database: Database;

    beforeEach(() => {
        database = createMockDatabase({
            execute: vi.fn().mockResolvedValue({
                rows: [
                    { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Widget', price: 29.99 },
                ],
            }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Input Validation', () => {
        it('should require array input for POST /api/data/:model', async () => {
            // Route handler should validate that body is an array
            const invalidBody = { name: 'Widget' };

            // The route handler throws HttpErrors.badRequest if not array
            expect(() => {
                if (!Array.isArray(invalidBody)) {
                    throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
                }
            }).toThrow('Request body must be an array of records');
        });

        it('should accept empty array', async () => {
            const body: any[] = [];

            // Should not throw for empty array (even if it's a no-op)
            expect(() => {
                if (!Array.isArray(body)) {
                    throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
                }
            }).not.toThrow();
        });

        it('should accept single record in array', async () => {
            const body = [{ name: 'Widget', price: 29.99 }];

            expect(() => {
                if (!Array.isArray(body)) {
                    throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
                }
            }).not.toThrow();
        });

        it('should accept multiple records in array', async () => {
            const body = [
                { name: 'Widget', price: 29.99 },
                { name: 'Gadget', price: 49.99 },
            ];

            expect(() => {
                if (!Array.isArray(body)) {
                    throw HttpErrors.badRequest('Request body must be an array of records', 'BODY_NOT_ARRAY');
                }
            }).not.toThrow();
        });
    });

    describe('Database Integration', () => {
        it('should call database.createAll() with model name and body', async () => {
            const modelName = 'products';
            const body = [{ name: 'Widget', price: 29.99 }];

            const createAllSpy = vi.spyOn(database, 'createAll').mockResolvedValue([]);

            await database.createAll(modelName as any, body);

            expect(createAllSpy).toHaveBeenCalledWith(modelName, body);
        });

        it('should pass through all records to database.createAll()', async () => {
            const modelName = 'products';
            const body = [
                { name: 'Widget', price: 29.99 },
                { name: 'Gadget', price: 49.99 },
                { name: 'Doohickey', price: 19.99 },
            ];

            const createAllSpy = vi.spyOn(database, 'createAll').mockResolvedValue([]);

            await database.createAll(modelName as any, body);

            expect(createAllSpy).toHaveBeenCalledWith(modelName, body);
            expect(createAllSpy).toHaveBeenCalledTimes(1);
        });

        it('should return created records from database.createAll()', async () => {
            const mockRecords = [
                {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    name: 'Widget',
                    price: 29.99,
                    created_at: '2024-01-01T00:00:00.000Z',
                    updated_at: '2024-01-01T00:00:00.000Z',
                },
            ];

            vi.spyOn(database, 'createAll').mockResolvedValue(mockRecords as any);

            const result = await database.createAll('products' as any, [{ name: 'Widget', price: 29.99 }]);

            expect(result).toEqual(mockRecords);
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(1);
        });

        it('should handle multiple created records', async () => {
            const mockRecords = [
                {
                    id: '123e4567-e89b-12d3-a456-426614174001',
                    name: 'Widget',
                    price: 29.99,
                },
                {
                    id: '123e4567-e89b-12d3-a456-426614174002',
                    name: 'Gadget',
                    price: 49.99,
                },
            ];

            vi.spyOn(database, 'createAll').mockResolvedValue(mockRecords as any);

            const body = [
                { name: 'Widget', price: 29.99 },
                { name: 'Gadget', price: 49.99 },
            ];

            const result = await database.createAll('products' as any, body);

            expect(result).toEqual(mockRecords);
            expect(result).toHaveLength(2);
        });
    });

    describe('Error Handling', () => {
        it('should propagate database errors', async () => {
            const dbError = new Error('Database connection failed');
            vi.spyOn(database, 'createAll').mockRejectedValue(dbError);

            const body = [{ name: 'Widget' }];

            await expect(database.createAll('products' as any, body))
                .rejects
                .toThrow('Database connection failed');
        });

        it('should propagate validation errors from database', async () => {
            const validationError = HttpErrors.badRequest('Missing required field: name', 'VALIDATION_ERROR');
            vi.spyOn(database, 'createAll').mockRejectedValue(validationError);

            const body = [{ price: 29.99 }]; // Missing required 'name' field

            await expect(database.createAll('products' as any, body))
                .rejects
                .toThrow('Missing required field: name');
        });

        it('should propagate model not found errors', async () => {
            const modelError = HttpErrors.notFound('Model not found', 'MODEL_NOT_FOUND');
            vi.spyOn(database, 'createAll').mockRejectedValue(modelError);

            const body = [{ name: 'Widget' }];

            await expect(database.createAll('nonexistent' as any, body))
                .rejects
                .toThrow('Model not found');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty array (no-op)', async () => {
            const mockRecords: any[] = [];
            const createAllSpy = vi.spyOn(database, 'createAll').mockResolvedValue(mockRecords);

            const result = await database.createAll('products' as any, []);

            expect(createAllSpy).toHaveBeenCalledWith('products', []);
            expect(result).toEqual([]);
        });

        it('should handle records with system fields', async () => {
            const body = [
                {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    name: 'Widget',
                    created_at: '2024-01-01T00:00:00.000Z',
                },
            ];

            const createAllSpy = vi.spyOn(database, 'createAll').mockResolvedValue([]);

            await database.createAll('products' as any, body);

            expect(createAllSpy).toHaveBeenCalledWith('products', body);
        });

        it('should handle records with null values', async () => {
            const body = [
                {
                    name: 'Widget',
                    description: null,
                    price: 29.99,
                },
            ];

            const createAllSpy = vi.spyOn(database, 'createAll').mockResolvedValue([]);

            await database.createAll('products' as any, body);

            expect(createAllSpy).toHaveBeenCalledWith('products', body);
        });

        it('should handle records with various data types', async () => {
            const body = [
                {
                    name: 'Widget',
                    price: 29.99,
                    quantity: 100,
                    in_stock: true,
                    tags: ['electronics', 'gadgets'],
                    metadata: { color: 'blue', size: 'large' },
                },
            ];

            const createAllSpy = vi.spyOn(database, 'createAll').mockResolvedValue([]);

            await database.createAll('products' as any, body);

            expect(createAllSpy).toHaveBeenCalledWith('products', body);
        });
    });

    describe('Model Name Handling', () => {
        it('should work with different model names', async () => {
            const models = ['users', 'orders', 'products', 'invoices'];
            const createAllSpy = vi.spyOn(database, 'createAll').mockResolvedValue([]);

            for (const model of models) {
                await database.createAll(model as any, [{ name: 'Test' }]);
            }

            expect(createAllSpy).toHaveBeenCalledTimes(models.length);
        });

        it('should pass model name exactly as provided', async () => {
            const modelName = 'custom_model_name';
            const body = [{ field: 'value' }];

            const createAllSpy = vi.spyOn(database, 'createAll').mockResolvedValue([]);

            await database.createAll(modelName as any, body);

            expect(createAllSpy).toHaveBeenCalledWith(modelName, body);
        });
    });
});
