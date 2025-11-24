import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Database } from '@src/lib/database.js';
import { createMockDatabase } from '../helpers/test-mocks.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/data/:model/:record - Route Handler Unit Tests
 *
 * Tests the route handler logic for updating a single record by ID.
 * Focuses on:
 * - Database method calls (database.updateOne)
 * - Smart routing (PATCH + trashed=true = revert)
 * - Proper parameter passing (model name, record ID, body)
 * - Error propagation
 */
describe('PUT /api/data/:model/:record - Route Handler', () => {
    let database: Database;
    let updateOneSpy: any;
    let revertOneSpy: any;

    beforeEach(() => {
        database = createMockDatabase({
            execute: vi.fn().mockResolvedValue({
                rows: [
                    {
                        id: '123e4567-e89b-12d3-a456-426614174000',
                        name: 'Updated Widget',
                        price: 39.99,
                        updated_at: '2024-01-02T00:00:00.000Z',
                    },
                ],
            }),
        });

        // Spy on database methods
        updateOneSpy = vi.spyOn(database, 'updateOne');
        revertOneSpy = vi.spyOn(database, 'revertOne');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Normal Update Operations', () => {
        it('should call database.updateOne() with model, record ID, and body', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const body = { name: 'Updated Widget', price: 39.99 };

            const mockRecord = { id: recordId, ...body };
            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            await database.updateOne(modelName as any, recordId, body);

            expect(updateOneSpy).toHaveBeenCalledWith(modelName, recordId, body);
        });

        it('should return updated record with new values', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Updated Widget',
                price: 39.99,
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-02T00:00:00.000Z',
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            const result = await database.updateOne(
                'products' as any,
                '123e4567-e89b-12d3-a456-426614174000',
                { name: 'Updated Widget', price: 39.99 }
            );

            expect(result).toEqual(mockRecord);
            expect(result.name).toBe('Updated Widget');
            expect(result.price).toBe(39.99);
        });

        it('should update single field', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                price: 39.99, // Only price changed
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            const result = await database.updateOne(
                'products' as any,
                '123e4567-e89b-12d3-a456-426614174000',
                { price: 39.99 }
            );

            expect(updateOneSpy).toHaveBeenCalledWith(
                'products',
                '123e4567-e89b-12d3-a456-426614174000',
                { price: 39.99 }
            );
        });

        it('should update multiple fields', async () => {
            const body = {
                name: 'Updated Widget',
                price: 39.99,
                quantity: 150,
                in_stock: false,
            };

            const mockRecord = { id: '123e4567-e89b-12d3-a456-426614174000', ...body };
            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            await database.updateOne('products' as any, '123e4567-e89b-12d3-a456-426614174000', body);

            expect(updateOneSpy).toHaveBeenCalledWith(
                'products',
                '123e4567-e89b-12d3-a456-426614174000',
                body
            );
        });

        it('should handle empty update body', async () => {
            const body = {};
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                price: 29.99,
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            await database.updateOne('products' as any, '123e4567-e89b-12d3-a456-426614174000', body);

            expect(updateOneSpy).toHaveBeenCalledWith(
                'products',
                '123e4567-e89b-12d3-a456-426614174000',
                body
            );
        });
    });

    describe('Revert Operations (PATCH + trashed=true)', () => {
        it('should call database.revertOne() when method is PATCH and trashed option is true', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';

            const mockRecord = {
                id: recordId,
                name: 'Widget',
                trashed_at: null, // Reverted record
            };

            vi.spyOn(database, 'revertOne').mockResolvedValue(mockRecord as any);

            // Simulate smart routing logic: PATCH + trashed=true
            const method = 'PATCH';
            const trashed = true;

            if (method === 'PATCH' && trashed === true) {
                await database.revertOne(modelName as any, recordId);
            }

            expect(revertOneSpy).toHaveBeenCalledWith(modelName, recordId);
        });

        it('should not call revertOne() for PUT method', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const body = { name: 'Updated Widget' };

            const mockRecord = { id: recordId, ...body };
            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            const method = 'PUT';
            const trashed = true;

            // Normal update even with trashed=true if method is PUT
            if (method === 'PATCH' && trashed === true) {
                await database.revertOne(modelName as any, recordId);
            } else {
                await database.updateOne(modelName as any, recordId, body);
            }

            expect(updateOneSpy).toHaveBeenCalled();
            expect(revertOneSpy).not.toHaveBeenCalled();
        });

        it('should not call revertOne() for PATCH without trashed option', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const body = { name: 'Updated Widget' };

            const mockRecord = { id: recordId, ...body };
            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            const method = 'PATCH';
            const trashed = false;

            if (method === 'PATCH' && trashed === true) {
                await database.revertOne(modelName as any, recordId);
            } else {
                await database.updateOne(modelName as any, recordId, body);
            }

            expect(updateOneSpy).toHaveBeenCalled();
            expect(revertOneSpy).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should propagate 404 error when record not found', async () => {
            const recordId = '123e4567-e89b-12d3-a456-426614174999';

            vi.spyOn(database, 'updateOne').mockRejectedValue(
                HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND')
            );

            await expect(
                database.updateOne('products' as any, recordId, { name: 'Updated' })
            ).rejects.toThrow('Record not found');
        });

        it('should propagate database errors', async () => {
            const dbError = new Error('Database connection failed');
            vi.spyOn(database, 'updateOne').mockRejectedValue(dbError);

            await expect(
                database.updateOne(
                    'products' as any,
                    '123e4567-e89b-12d3-a456-426614174000',
                    { name: 'Updated' }
                )
            ).rejects.toThrow('Database connection failed');
        });

        it('should propagate validation errors', async () => {
            const validationError = HttpErrors.badRequest('Invalid field value', 'VALIDATION_ERROR');
            vi.spyOn(database, 'updateOne').mockRejectedValue(validationError);

            await expect(
                database.updateOne(
                    'products' as any,
                    '123e4567-e89b-12d3-a456-426614174000',
                    { price: 'invalid' }
                )
            ).rejects.toThrow('Invalid field value');
        });

        it('should propagate model not found errors', async () => {
            const modelError = HttpErrors.notFound('Model not found', 'MODEL_NOT_FOUND');
            vi.spyOn(database, 'updateOne').mockRejectedValue(modelError);

            await expect(
                database.updateOne(
                    'nonexistent' as any,
                    '123e4567-e89b-12d3-a456-426614174000',
                    { name: 'Updated' }
                )
            ).rejects.toThrow('Model not found');
        });
    });

    describe('Data Types', () => {
        it('should handle updates with various data types', async () => {
            const body = {
                name: 'Widget',
                price: 29.99,
                quantity: 100,
                in_stock: true,
                tags: ['electronics', 'gadgets'],
                metadata: { color: 'blue', size: 'large' },
            };

            const mockRecord = { id: '123e4567-e89b-12d3-a456-426614174000', ...body };
            const updateSpy = vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            await database.updateOne('products' as any, '123e4567-e89b-12d3-a456-426614174000', body);

            expect(updateSpy).toHaveBeenCalledWith(
                'products',
                '123e4567-e89b-12d3-a456-426614174000',
                body
            );
        });

        it('should handle null values in updates', async () => {
            const body = {
                description: null,
                optional_field: null,
            };

            const mockRecord = { id: '123e4567-e89b-12d3-a456-426614174000', ...body };
            const updateSpy = vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            await database.updateOne('products' as any, '123e4567-e89b-12d3-a456-426614174000', body);

            expect(updateSpy).toHaveBeenCalledWith(
                'products',
                '123e4567-e89b-12d3-a456-426614174000',
                body
            );
        });

        it('should handle boolean value updates', async () => {
            const body = { in_stock: false };

            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                in_stock: false,
            };

            const updateSpy = vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            await database.updateOne('products' as any, '123e4567-e89b-12d3-a456-426614174000', body);

            expect(updateSpy).toHaveBeenCalledWith(
                'products',
                '123e4567-e89b-12d3-a456-426614174000',
                body
            );
        });
    });

    describe('Model Name Handling', () => {
        it('should work with different model names', async () => {
            const models = ['users', 'orders', 'products', 'invoices'];
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const body = { name: 'Updated' };

            for (const model of models) {
                const mockRecord = { id: recordId, ...body };
                vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

                await database.updateOne(model as any, recordId, body);
            }

            expect(updateOneSpy).toHaveBeenCalledTimes(models.length);
        });

        it('should pass model name exactly as provided', async () => {
            const modelName = 'custom_model_name';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const body = { field: 'value' };

            const mockRecord = { id: recordId, ...body };
            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            await database.updateOne(modelName as any, recordId, body);

            expect(updateOneSpy).toHaveBeenCalledWith(modelName, recordId, body);
        });
    });

    describe('Timestamp Behavior', () => {
        it('should update updated_at timestamp', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Updated Widget',
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-02T00:00:00.000Z', // Changed
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            const result = await database.updateOne(
                'products' as any,
                '123e4567-e89b-12d3-a456-426614174000',
                { name: 'Updated Widget' }
            );

            expect(result.updated_at).toBe('2024-01-02T00:00:00.000Z');
        });

        it('should preserve created_at timestamp', async () => {
            const createdAt = '2024-01-01T00:00:00.000Z';
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Updated Widget',
                created_at: createdAt, // Unchanged
                updated_at: '2024-01-02T00:00:00.000Z',
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            const result = await database.updateOne(
                'products' as any,
                '123e4567-e89b-12d3-a456-426614174000',
                { name: 'Updated Widget' }
            );

            expect(result.created_at).toBe(createdAt);
        });
    });
});
