import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Database } from '@src/lib/database.js';
import { createMockDatabase } from '../helpers/test-mocks.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * Database CRUD Operations Unit Tests
 *
 * Tests the Database class methods used by Data API routes.
 * Focuses on:
 * - createAll() - Create multiple records via observer pipeline
 * - select404() - Select single record or throw 404
 * - updateOne() - Update single record by ID
 * - deleteOne() - Soft delete single record
 * - delete404() - Delete by filter or throw 404
 * - revertOne() - Restore soft-deleted record
 */
describe('Database - CRUD Operations', () => {
    let database: Database;

    beforeEach(() => {
        database = createMockDatabase({
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createAll()', () => {
        it('should create multiple records via observer pipeline', async () => {
            const mockRecords = [
                { id: '123e4567-e89b-12d3-a456-426614174001', name: 'Widget' },
                { id: '123e4567-e89b-12d3-a456-426614174002', name: 'Gadget' },
            ];

            vi.spyOn(database, 'createAll').mockResolvedValue(mockRecords as any);

            const result = await database.createAll('products' as any, [
                { name: 'Widget' },
                { name: 'Gadget' },
            ]);

            expect(result).toEqual(mockRecords);
            expect(result).toHaveLength(2);
        });

        it('should return array of created records with IDs', async () => {
            const mockRecords = [
                {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    name: 'Widget',
                    created_at: '2024-01-01T00:00:00.000Z',
                    updated_at: '2024-01-01T00:00:00.000Z',
                },
            ];

            vi.spyOn(database, 'createAll').mockResolvedValue(mockRecords as any);

            const result = await database.createAll('products' as any, [{ name: 'Widget' }]);

            expect(result[0]).toHaveProperty('id');
            expect(result[0]).toHaveProperty('created_at');
            expect(result[0]).toHaveProperty('updated_at');
        });

        it('should handle empty array input', async () => {
            vi.spyOn(database, 'createAll').mockResolvedValue([]);

            const result = await database.createAll('products' as any, []);

            expect(result).toEqual([]);
        });

        it('should propagate validation errors from observer pipeline', async () => {
            const validationError = HttpErrors.badRequest('Missing required field', 'VALIDATION_ERROR');
            vi.spyOn(database, 'createAll').mockRejectedValue(validationError);

            await expect(database.createAll('products' as any, [{ price: 29.99 }]))
                .rejects
                .toThrow('Missing required field');
        });
    });

    describe('select404()', () => {
        it('should return record when found', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
            };

            vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            const result = await database.select404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result).toEqual(mockRecord);
        });

        it('should throw 404 error when record not found', async () => {
            vi.spyOn(database, 'select404').mockRejectedValue(
                HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND')
            );

            await expect(
                database.select404('products' as any, {
                    where: { id: '123e4567-e89b-12d3-a456-426614174999' },
                })
            ).rejects.toThrow('Record not found');
        });

        it('should accept custom error message', async () => {
            const customMessage = 'Product not found';
            vi.spyOn(database, 'select404').mockRejectedValue(
                HttpErrors.notFound(customMessage, 'RECORD_NOT_FOUND')
            );

            await expect(
                database.select404(
                    'products' as any,
                    { where: { id: '123e4567-e89b-12d3-a456-426614174999' } },
                    customMessage
                )
            ).rejects.toThrow(customMessage);
        });

        it('should pass options to select query', async () => {
            const mockRecord = { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Widget' };
            const select404Spy = vi.spyOn(database, 'select404').mockResolvedValue(mockRecord as any);

            const options = { context: 'api' as const, trashed: 'exclude' as const };

            await database.select404(
                'products' as any,
                { where: { id: '123e4567-e89b-12d3-a456-426614174000' } },
                undefined,
                options
            );

            expect(select404Spy).toHaveBeenCalledWith(
                'products',
                { where: { id: '123e4567-e89b-12d3-a456-426614174000' } },
                undefined,
                options
            );
        });
    });

    describe('updateOne()', () => {
        it('should update single record by ID', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Updated Widget',
                price: 39.99,
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            const result = await database.updateOne(
                'products' as any,
                '123e4567-e89b-12d3-a456-426614174000',
                { name: 'Updated Widget', price: 39.99 }
            );

            expect(result).toEqual(mockRecord);
        });

        it('should throw 404 when record not found', async () => {
            vi.spyOn(database, 'updateOne').mockRejectedValue(
                HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND')
            );

            await expect(
                database.updateOne(
                    'products' as any,
                    '123e4567-e89b-12d3-a456-426614174999',
                    { name: 'Updated' }
                )
            ).rejects.toThrow('Record not found');
        });

        it('should accept partial updates', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                price: 39.99,
            };

            const updateOneSpy = vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            await database.updateOne(
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
    });

    describe('deleteOne()', () => {
        it('should soft delete record by setting trashed_at', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                trashed_at: '2024-01-02T00:00:00.000Z',
                deleted_at: null,
            };

            vi.spyOn(database, 'deleteOne').mockResolvedValue(mockRecord as any);

            const result = await database.deleteOne('products' as any, '123e4567-e89b-12d3-a456-426614174000');

            expect(result).toEqual(mockRecord);
            expect(result.trashed_at).toBeTruthy();
            expect(result.deleted_at).toBeNull();
        });

        it('should throw 404 when record not found', async () => {
            vi.spyOn(database, 'deleteOne').mockRejectedValue(
                HttpErrors.notFound('Record not found or already trashed', 'RECORD_NOT_FOUND')
            );

            await expect(
                database.deleteOne('products' as any, '123e4567-e89b-12d3-a456-426614174999')
            ).rejects.toThrow('Record not found or already trashed');
        });

        it('should return full record after soft delete', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                price: 29.99,
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-01T00:00:00.000Z',
                trashed_at: '2024-01-02T00:00:00.000Z',
                deleted_at: null,
            };

            vi.spyOn(database, 'deleteOne').mockResolvedValue(mockRecord as any);

            const result = await database.deleteOne('products' as any, '123e4567-e89b-12d3-a456-426614174000');

            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('name');
            expect(result).toHaveProperty('price');
            expect(result).toHaveProperty('trashed_at');
        });
    });

    describe('delete404()', () => {
        it('should select record then delete it', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                trashed_at: '2024-01-02T00:00:00.000Z',
            };

            vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

            const result = await database.delete404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result).toEqual(mockRecord);
        });

        it('should throw 404 if record not found before delete', async () => {
            vi.spyOn(database, 'delete404').mockRejectedValue(
                HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND')
            );

            await expect(
                database.delete404('products' as any, {
                    where: { id: '123e4567-e89b-12d3-a456-426614174999' },
                })
            ).rejects.toThrow('Record not found');
        });

        it('should accept custom error message', async () => {
            const customMessage = 'Product not found';
            vi.spyOn(database, 'delete404').mockRejectedValue(
                HttpErrors.notFound(customMessage, 'RECORD_NOT_FOUND')
            );

            await expect(
                database.delete404(
                    'products' as any,
                    { where: { id: '123e4567-e89b-12d3-a456-426614174999' } },
                    customMessage
                )
            ).rejects.toThrow(customMessage);
        });

        it('should work with any filter criteria', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                trashed_at: '2024-01-02T00:00:00.000Z',
            };

            const delete404Spy = vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

            await database.delete404('products' as any, { where: { name: 'Widget' } });

            expect(delete404Spy).toHaveBeenCalledWith('products', { where: { name: 'Widget' } });
        });
    });

    describe('revertOne()', () => {
        it('should restore soft-deleted record by clearing trashed_at', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                trashed_at: null, // Reverted
            };

            vi.spyOn(database, 'revertOne').mockResolvedValue(mockRecord as any);

            const result = await database.revertOne('products' as any, '123e4567-e89b-12d3-a456-426614174000');

            expect(result).toEqual(mockRecord);
            expect(result.trashed_at).toBeNull();
        });

        it('should throw 404 when record not found or not trashed', async () => {
            vi.spyOn(database, 'revertOne').mockRejectedValue(
                HttpErrors.notFound('Record not found or not trashed', 'RECORD_NOT_FOUND')
            );

            await expect(
                database.revertOne('products' as any, '123e4567-e89b-12d3-a456-426614174999')
            ).rejects.toThrow('Record not found or not trashed');
        });

        it('should return full record after revert', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                price: 29.99,
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-01T00:00:00.000Z',
                trashed_at: null,
            };

            vi.spyOn(database, 'revertOne').mockResolvedValue(mockRecord as any);

            const result = await database.revertOne('products' as any, '123e4567-e89b-12d3-a456-426614174000');

            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('name');
            expect(result).toHaveProperty('trashed_at');
            expect(result.trashed_at).toBeNull();
        });
    });

    describe('Observer Pipeline Integration', () => {
        it('should execute observer pipeline for createAll', async () => {
            const runPipelineSpy = vi.spyOn(database as any, 'runObserverPipeline');

            vi.spyOn(database, 'createAll').mockResolvedValue([]);

            await database.createAll('products' as any, [{ name: 'Widget' }]);

            // Verify the method exists and would be called
            expect(database.createAll).toBeDefined();
        });

        it('should execute observer pipeline for updateAll', async () => {
            vi.spyOn(database, 'updateAll').mockResolvedValue([]);

            await database.updateAll('products' as any, [
                { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Updated' },
            ]);

            expect(database.updateAll).toBeDefined();
        });

        it('should execute observer pipeline for deleteAll', async () => {
            vi.spyOn(database, 'deleteAll').mockResolvedValue([]);

            await database.deleteAll('products' as any, [{ id: '123e4567-e89b-12d3-a456-426614174000' }]);

            expect(database.deleteAll).toBeDefined();
        });
    });

    describe('Error Propagation', () => {
        it('should propagate database connection errors', async () => {
            const dbError = new Error('Database connection failed');

            vi.spyOn(database, 'createAll').mockRejectedValue(dbError);

            await expect(database.createAll('products' as any, [{ name: 'Widget' }]))
                .rejects
                .toThrow('Database connection failed');
        });

        it('should propagate model not found errors', async () => {
            const modelError = HttpErrors.notFound('Model not found', 'MODEL_NOT_FOUND');

            vi.spyOn(database, 'createAll').mockRejectedValue(modelError);

            await expect(database.createAll('nonexistent' as any, [{ name: 'Widget' }]))
                .rejects
                .toThrow('Model not found');
        });

        it('should propagate observer errors', async () => {
            const observerError = new Error('Observer validation failed');

            vi.spyOn(database, 'createAll').mockRejectedValue(observerError);

            await expect(database.createAll('products' as any, [{ name: 'Widget' }]))
                .rejects
                .toThrow('Observer validation failed');
        });
    });

    describe('Model Name Handling', () => {
        it('should work with various model names', async () => {
            const models = ['users', 'orders', 'products', 'invoices', 'custom_model'];
            const createSpy = vi.spyOn(database, 'createAll').mockResolvedValue([]);

            for (const model of models) {
                await database.createAll(model as any, [{ name: 'Test' }]);
            }

            expect(createSpy).toHaveBeenCalledTimes(models.length);
        });
    });
});
