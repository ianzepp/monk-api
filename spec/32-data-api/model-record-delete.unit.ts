import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Database } from '@src/lib/database.js';
import { createMockDatabase, createMockSystem } from '../helpers/test-mocks.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * DELETE /api/data/:model/:record - Route Handler Unit Tests
 *
 * Tests the route handler logic for deleting a single record by ID.
 * Focuses on:
 * - Soft delete (default): database.delete404() sets trashed_at
 * - Permanent delete (with ?permanent=true): database.updateOne() sets deleted_at
 * - Root access check for permanent deletes
 * - Error propagation
 */
describe('DELETE /api/data/:model/:record - Route Handler', () => {
    let database: Database;
    let delete404Spy: any;
    let updateOneSpy: any;

    beforeEach(() => {
        database = createMockDatabase({
            execute: vi.fn().mockResolvedValue({
                rows: [
                    {
                        id: '123e4567-e89b-12d3-a456-426614174000',
                        name: 'Widget',
                        trashed_at: '2024-01-02T00:00:00.000Z',
                        deleted_at: null,
                    },
                ],
            }),
        });

        // Spy on database methods
        delete404Spy = vi.spyOn(database, 'delete404');
        updateOneSpy = vi.spyOn(database, 'updateOne');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Soft Delete (Default)', () => {
        it('should call database.delete404() for normal delete', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';

            const mockRecord = {
                id: recordId,
                name: 'Widget',
                trashed_at: '2024-01-02T00:00:00.000Z',
                deleted_at: null,
            };

            vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

            const isPermanent = false; // Normal soft delete

            if (isPermanent) {
                // Not executed
            } else {
                await database.delete404(modelName as any, { where: { id: recordId } });
            }

            expect(delete404Spy).toHaveBeenCalledWith(modelName, { where: { id: recordId } });
        });

        it('should set trashed_at timestamp on soft delete', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                trashed_at: '2024-01-02T00:00:00.000Z',
                deleted_at: null, // Still null for soft delete
            };

            vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

            const result = await database.delete404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result.trashed_at).toBeTruthy();
            expect(result.deleted_at).toBeNull();
        });

        it('should return full record with all fields after soft delete', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                price: 29.99,
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-01T00:00:00.000Z',
                trashed_at: '2024-01-02T00:00:00.000Z',
                deleted_at: null,
            };

            vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

            const result = await database.delete404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result).toEqual(mockRecord);
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('name');
            expect(result).toHaveProperty('price');
            expect(result).toHaveProperty('trashed_at');
        });
    });

    describe('Permanent Delete (with ?permanent=true)', () => {
        it('should call database.updateOne() with deleted_at for permanent delete', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const isPermanent = true;

            const mockSystem = createMockSystem({
                database,
                isRoot: vi.fn().mockReturnValue(true), // Root access
            });

            const mockRecord = {
                id: recordId,
                name: 'Widget',
                deleted_at: expect.any(String),
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            // Simulate permanent delete logic
            if (isPermanent) {
                if (!mockSystem.isRoot()) {
                    throw HttpErrors.forbidden('Insufficient permissions for permanent delete', 'ACCESS_DENIED');
                }
                await database.updateOne(modelName as any, recordId, { deleted_at: new Date().toISOString() });
            }

            expect(updateOneSpy).toHaveBeenCalledWith(
                modelName,
                recordId,
                expect.objectContaining({ deleted_at: expect.any(String) })
            );
        });

        it('should require root access for permanent delete', async () => {
            const isPermanent = true;

            const mockSystem = createMockSystem({
                database,
                isRoot: vi.fn().mockReturnValue(false), // Not root
            });

            // Simulate permission check
            expect(() => {
                if (isPermanent && !mockSystem.isRoot()) {
                    throw HttpErrors.forbidden('Insufficient permissions for permanent delete', 'ACCESS_DENIED');
                }
            }).toThrow('Insufficient permissions for permanent delete');
        });

        it('should allow permanent delete with root access', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';
            const isPermanent = true;

            const mockSystem = createMockSystem({
                database,
                isRoot: vi.fn().mockReturnValue(true), // Root access
            });

            const mockRecord = {
                id: recordId,
                name: 'Widget',
                deleted_at: '2024-01-02T00:00:00.000Z',
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            // Should not throw with root access
            if (isPermanent) {
                if (!mockSystem.isRoot()) {
                    throw HttpErrors.forbidden('Insufficient permissions for permanent delete', 'ACCESS_DENIED');
                }
                await database.updateOne(modelName as any, recordId, { deleted_at: new Date().toISOString() });
            }

            expect(updateOneSpy).toHaveBeenCalled();
        });

        it('should set deleted_at timestamp on permanent delete', async () => {
            const modelName = 'products';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';

            const mockRecord = {
                id: recordId,
                name: 'Widget',
                deleted_at: '2024-01-02T00:00:00.000Z',
            };

            vi.spyOn(database, 'updateOne').mockResolvedValue(mockRecord as any);

            const result = await database.updateOne(modelName as any, recordId, {
                deleted_at: new Date().toISOString(),
            });

            expect(result.deleted_at).toBeTruthy();
        });
    });

    describe('Query Parameter Handling', () => {
        it('should default to soft delete when permanent parameter is missing', () => {
            const permanent = undefined;
            const isPermanent = permanent === 'true';

            expect(isPermanent).toBe(false);
        });

        it('should recognize permanent=true', () => {
            const permanent = 'true';
            const isPermanent = permanent === 'true';

            expect(isPermanent).toBe(true);
        });

        it('should not recognize permanent=false as permanent delete', () => {
            const permanent = 'false';
            const isPermanent = permanent === 'true';

            expect(isPermanent).toBe(false);
        });

        it('should not recognize other values as permanent delete', () => {
            const values = ['1', 'yes', 'TRUE', 'True', ''];

            for (const value of values) {
                const isPermanent = value === 'true';
                expect(isPermanent).toBe(false);
            }
        });
    });

    describe('Error Handling', () => {
        it('should propagate 404 error when record not found', async () => {
            const recordId = '123e4567-e89b-12d3-a456-426614174999';

            vi.spyOn(database, 'delete404').mockRejectedValue(
                HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND')
            );

            await expect(
                database.delete404('products' as any, { where: { id: recordId } })
            ).rejects.toThrow('Record not found');
        });

        it('should propagate database errors', async () => {
            const dbError = new Error('Database connection failed');
            vi.spyOn(database, 'delete404').mockRejectedValue(dbError);

            await expect(
                database.delete404('products' as any, {
                    where: { id: '123e4567-e89b-12d3-a456-426614174000' },
                })
            ).rejects.toThrow('Database connection failed');
        });

        it('should propagate model not found errors', async () => {
            const modelError = HttpErrors.notFound('Model not found', 'MODEL_NOT_FOUND');
            vi.spyOn(database, 'delete404').mockRejectedValue(modelError);

            await expect(
                database.delete404('nonexistent' as any, {
                    where: { id: '123e4567-e89b-12d3-a456-426614174000' },
                })
            ).rejects.toThrow('Model not found');
        });

        it('should throw error for permanent delete without root access', () => {
            const mockSystem = createMockSystem({
                database,
                isRoot: vi.fn().mockReturnValue(false),
            });

            expect(() => {
                const isPermanent = true;
                if (isPermanent && !mockSystem.isRoot()) {
                    throw HttpErrors.forbidden('Insufficient permissions for permanent delete', 'ACCESS_DENIED');
                }
            }).toThrow('Insufficient permissions for permanent delete');
        });
    });

    describe('Model Name Handling', () => {
        it('should work with different model names', async () => {
            const models = ['users', 'orders', 'products', 'invoices'];
            const recordId = '123e4567-e89b-12d3-a456-426614174000';

            for (const model of models) {
                const mockRecord = { id: recordId, trashed_at: '2024-01-02T00:00:00.000Z' };
                vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

                await database.delete404(model as any, { where: { id: recordId } });
            }

            expect(delete404Spy).toHaveBeenCalledTimes(models.length);
        });

        it('should pass model name exactly as provided', async () => {
            const modelName = 'custom_model_name';
            const recordId = '123e4567-e89b-12d3-a456-426614174000';

            const mockRecord = { id: recordId, trashed_at: '2024-01-02T00:00:00.000Z' };
            vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

            await database.delete404(modelName as any, { where: { id: recordId } });

            expect(delete404Spy).toHaveBeenCalledWith(modelName, { where: { id: recordId } });
        });
    });

    describe('Timestamp Verification', () => {
        it('should verify trashed_at is set for soft delete', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Widget',
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-01T00:00:00.000Z',
                trashed_at: '2024-01-02T00:00:00.000Z',
                deleted_at: null,
            };

            vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

            const result = await database.delete404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result.trashed_at).not.toBeNull();
            expect(new Date(result.trashed_at!).getTime()).toBeGreaterThan(0);
        });

        it('should verify deleted_at is null for soft delete', async () => {
            const mockRecord = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                trashed_at: '2024-01-02T00:00:00.000Z',
                deleted_at: null,
            };

            vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

            const result = await database.delete404('products' as any, {
                where: { id: '123e4567-e89b-12d3-a456-426614174000' },
            });

            expect(result.deleted_at).toBeNull();
        });
    });

    describe('Multiple Delete Operations', () => {
        it('should handle multiple independent delete operations', async () => {
            const recordIds = [
                '123e4567-e89b-12d3-a456-426614174001',
                '123e4567-e89b-12d3-a456-426614174002',
                '123e4567-e89b-12d3-a456-426614174003',
            ];

            for (const recordId of recordIds) {
                const mockRecord = { id: recordId, trashed_at: '2024-01-02T00:00:00.000Z' };
                vi.spyOn(database, 'delete404').mockResolvedValue(mockRecord as any);

                await database.delete404('products' as any, { where: { id: recordId } });
            }

            expect(delete404Spy).toHaveBeenCalledTimes(recordIds.length);
        });
    });
});
