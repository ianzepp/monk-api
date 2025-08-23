/**
 * Database Observer Tests
 */

import { describe, test, beforeEach, expect, vi } from 'vitest';
import { DatabaseObserver } from '@lib/observers/database-observer.js';
import { ObserverRing } from '@observers/types.js';
import { createMockContext } from '@test/helpers/observer-helpers.js';

describe('DatabaseObserver', () => {
    let databaseObserver: DatabaseObserver;
    let mockContext: any;

    beforeEach(() => {
        databaseObserver = new DatabaseObserver();
        mockContext = createMockContext('user', 'create', { email: 'test@example.com' });
        
        // Reset database mocks
        vi.clearAllMocks();
    });

    describe('configuration', () => {
        test('should be configured for database ring', () => {
            expect(databaseObserver.ring).toBe(ObserverRing.Database);
            expect(databaseObserver.name).toBe('DatabaseObserver');
        });
    });

    describe('create operations', () => {
        test('should handle create operation successfully', async () => {
            const expectedResult = { id: 'user-123', email: 'test@example.com' };
            mockContext.system.database.createOne.mockResolvedValue(expectedResult);

            await databaseObserver.execute(mockContext);

            expect(mockContext.system.database.createOne).toHaveBeenCalledWith(
                'user',
                { email: 'test@example.com' }
            );
            expect(mockContext.result).toEqual(expectedResult);
            expect(mockContext.errors).toHaveLength(0);
        });

        test('should handle create operation failure', async () => {
            const dbError = new Error('Database connection failed');
            mockContext.system.database.createOne.mockRejectedValue(dbError);

            await databaseObserver.execute(mockContext);

            expect(mockContext.errors).toHaveLength(1);
            expect(mockContext.errors[0].code).toBe('DATABASE_OPERATION_FAILED');
            expect(mockContext.errors[0].message).toContain('Database operation failed');
        });

        test('should reject create with no data', async () => {
            mockContext.data = null;

            await databaseObserver.execute(mockContext);

            expect(mockContext.errors).toHaveLength(1);
            expect(mockContext.errors[0].message).toContain('No data provided for create operation');
            expect(mockContext.system.database.createOne).not.toHaveBeenCalled();
        });
    });

    describe('update operations', () => {
        beforeEach(() => {
            mockContext.operation = 'update';
            mockContext.recordId = 'user-123';
            mockContext.existing = { id: 'user-123', email: 'old@example.com' };
            mockContext.data = { email: 'new@example.com' };
        });

        test('should handle update operation successfully', async () => {
            const expectedResult = { id: 'user-123', email: 'new@example.com' };
            mockContext.system.database.updateOne.mockResolvedValue(expectedResult);

            await databaseObserver.execute(mockContext);

            expect(mockContext.system.database.updateOne).toHaveBeenCalledWith(
                'user',
                'user-123',
                { email: 'new@example.com' }
            );
            expect(mockContext.result).toEqual(expectedResult);
            expect(mockContext.errors).toHaveLength(0);
        });

        test('should reject update with no record ID', async () => {
            mockContext.recordId = null;

            await databaseObserver.execute(mockContext);

            expect(mockContext.errors).toHaveLength(1);
            expect(mockContext.errors[0].message).toContain('No record ID provided for update operation');
            expect(mockContext.system.database.updateOne).not.toHaveBeenCalled();
        });

        test('should reject update with no data', async () => {
            mockContext.data = {};

            await databaseObserver.execute(mockContext);

            expect(mockContext.errors).toHaveLength(1);
            expect(mockContext.errors[0].message).toContain('No update data provided');
            expect(mockContext.system.database.updateOne).not.toHaveBeenCalled();
        });
    });

    describe('delete operations', () => {
        beforeEach(() => {
            mockContext.operation = 'delete';
            mockContext.recordId = 'user-123';
            mockContext.existing = { id: 'user-123', email: 'test@example.com' };
        });

        test('should handle delete operation successfully', async () => {
            const expectedResult = { id: 'user-123', deleted: true };
            mockContext.system.database.deleteOne.mockResolvedValue(expectedResult);

            await databaseObserver.execute(mockContext);

            expect(mockContext.system.database.deleteOne).toHaveBeenCalledWith(
                'user',
                'user-123'
            );
            expect(mockContext.result).toEqual(expectedResult);
            expect(mockContext.errors).toHaveLength(0);
        });

        test('should reject delete with no record ID', async () => {
            mockContext.recordId = null;

            await databaseObserver.execute(mockContext);

            expect(mockContext.errors).toHaveLength(1);
            expect(mockContext.errors[0].message).toContain('No record ID provided for delete operation');
            expect(mockContext.system.database.deleteOne).not.toHaveBeenCalled();
        });
    });

    describe('select operations', () => {
        beforeEach(() => {
            mockContext.operation = 'select';
            mockContext.recordId = 'user-123';
        });

        test('should handle select operation successfully', async () => {
            const expectedResult = { id: 'user-123', email: 'test@example.com' };
            mockContext.system.database.selectOne.mockResolvedValue(expectedResult);

            await databaseObserver.execute(mockContext);

            expect(mockContext.system.database.selectOne).toHaveBeenCalledWith(
                'user',
                { where: { id: 'user-123' } }
            );
            expect(mockContext.result).toEqual(expectedResult);
            expect(mockContext.errors).toHaveLength(0);
        });

        test('should reject select with no record ID', async () => {
            mockContext.recordId = null;

            await databaseObserver.execute(mockContext);

            expect(mockContext.errors).toHaveLength(1);
            expect(mockContext.errors[0].message).toContain('No record ID provided for select operation');
            expect(mockContext.system.database.selectOne).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        test('should handle unsupported operations', async () => {
            mockContext.operation = 'unsupported' as any;

            await databaseObserver.execute(mockContext);

            expect(mockContext.errors).toHaveLength(1);
            expect(mockContext.errors[0].message).toContain('Unsupported database operation: unsupported');
        });
    });
});