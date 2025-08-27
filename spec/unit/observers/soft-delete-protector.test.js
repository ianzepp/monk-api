/**
 * Unit Tests: Soft Delete Protector Observer
 *
 * Tests the soft delete protection functionality that prevents operations
 * on trashed and deleted records using preloaded record data.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import SoftDeleteProtector from '@src/observers/all/1/soft-delete-protector.js';
import { SecurityError } from '@lib/observers/errors.js';
import { ObserverRing } from '@lib/observers/types.js';
describe('Unit: SoftDeleteProtector Observer', () => {
    let observer;
    let mockContext;
    beforeEach(() => {
        observer = new SoftDeleteProtector();
        // Create mock context with minimal required properties
        mockContext = {
            system: {
                info: () => { },
                warn: () => { }
            },
            schemaName: 'test_schema',
            schema: {},
            operation: 'update',
            data: [],
            metadata: new Map(),
            errors: [],
            warnings: [],
            startTime: Date.now()
        };
    });
    describe('Configuration', () => {
        test('should have correct ring assignment', () => {
            expect(observer.ring).toBe(ObserverRing.Security);
        });
        test('should target correct operations', () => {
            expect(observer.operations).toEqual(['update', 'delete']);
        });
        test('should execute for update operations', () => {
            expect(observer.shouldExecute('update')).toBe(true);
        });
        test('should execute for delete operations', () => {
            expect(observer.shouldExecute('delete')).toBe(true);
        });
        test('should not execute for create operations', () => {
            expect(observer.shouldExecute('create')).toBe(false);
        });
        test('should not execute for revert operations', () => {
            expect(observer.shouldExecute('revert')).toBe(false);
        });
    });
    describe('Preload Error Handling', () => {
        test('should skip validation when preload failed', async () => {
            // Set preload error state
            mockContext.metadata.set('preload_error', true);
            mockContext.metadata.set('requested_record_count', 2);
            // Should not throw, just skip validation
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('soft_delete_protection')).toBe('skipped_preload_error');
        });
        test('should handle missing preload data gracefully', async () => {
            // No preload data set - should use empty array
            mockContext.data = [{ id: 'test-1' }];
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('soft_delete_protection')).toBe('passed');
        });
    });
    describe('Trashed Record Detection', () => {
        test('should allow operations on non-trashed records', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Active', trashed_at: null },
                { id: 'record-2', name: 'Also Active', trashed_at: undefined }
            ];
            // Set up preloaded records
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            mockContext.data = [{ id: 'record-1' }, { id: 'record-2' }];
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('soft_delete_protection')).toBe('passed');
            expect(mockContext.metadata.get('trashed_record_count')).toBe(0);
        });
        test('should block operations on trashed records', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Active', trashed_at: null },
                { id: 'record-2', name: 'Trashed', trashed_at: '2024-01-01T00:00:00Z' }
            ];
            // Set up preloaded records
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            mockContext.data = [{ id: 'record-1' }, { id: 'record-2' }];
            mockContext.operation = 'update';
            await expect(observer.execute(mockContext)).rejects.toThrow(SecurityError);
            try {
                await observer.execute(mockContext);
            }
            catch (error) {
                expect(error).toBeInstanceOf(SecurityError);
                expect(error.message).toContain('Cannot update trashed records: record-2');
                expect(error.code).toBe('SOFT_DELETE_PROTECTION');
            }
        });
        test('should block operations on multiple trashed records', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Trashed 1', trashed_at: '2024-01-01T00:00:00Z' },
                { id: 'record-2', name: 'Active', trashed_at: null },
                { id: 'record-3', name: 'Trashed 2', trashed_at: '2024-01-02T00:00:00Z' }
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            mockContext.data = [{ id: 'record-1' }, { id: 'record-2' }, { id: 'record-3' }];
            mockContext.operation = 'delete';
            await expect(observer.execute(mockContext)).rejects.toThrow(SecurityError);
            try {
                await observer.execute(mockContext);
            }
            catch (error) {
                expect(error.message).toContain('Cannot delete trashed records: record-1, record-3');
            }
        });
    });
    describe('Hard Deleted Record Detection', () => {
        test('should block operations on deleted records', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Active', trashed_at: null, deleted_at: null },
                { id: 'record-2', name: 'Deleted', trashed_at: null, deleted_at: '2024-01-01T00:00:00Z' }
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            mockContext.data = [{ id: 'record-1' }, { id: 'record-2' }];
            mockContext.operation = 'update';
            await expect(observer.execute(mockContext)).rejects.toThrow(SecurityError);
            try {
                await observer.execute(mockContext);
            }
            catch (error) {
                expect(error).toBeInstanceOf(SecurityError);
                expect(error.message).toContain('Cannot update permanently deleted records: record-2');
                expect(error.code).toBe('HARD_DELETE_PROTECTION');
            }
        });
        test('should block operations on multiple deleted records', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Deleted 1', deleted_at: '2024-01-01T00:00:00Z' },
                { id: 'record-2', name: 'Deleted 2', deleted_at: '2024-01-02T00:00:00Z' }
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            mockContext.data = [{ id: 'record-1' }, { id: 'record-2' }];
            mockContext.operation = 'delete';
            await expect(observer.execute(mockContext)).rejects.toThrow(SecurityError);
            try {
                await observer.execute(mockContext);
            }
            catch (error) {
                expect(error.message).toContain('Cannot delete permanently deleted records: record-1, record-2');
            }
        });
        test('should prioritize trashed over deleted in error message', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Trashed', trashed_at: '2024-01-01T00:00:00Z', deleted_at: null },
                { id: 'record-2', name: 'Deleted', trashed_at: null, deleted_at: '2024-01-02T00:00:00Z' }
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            mockContext.data = [{ id: 'record-1' }, { id: 'record-2' }];
            // Should throw trashed error first (checked first)
            await expect(observer.execute(mockContext)).rejects.toThrow(SecurityError);
            try {
                await observer.execute(mockContext);
            }
            catch (error) {
                expect(error.message).toContain('trashed records: record-1');
                expect(error.code).toBe('SOFT_DELETE_PROTECTION');
            }
        });
    });
    describe('Metadata Recording', () => {
        test('should record successful protection check', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Active', trashed_at: null, deleted_at: null }
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            mockContext.data = [{ id: 'record-1' }];
            await observer.execute(mockContext);
            expect(mockContext.metadata.get('soft_delete_protection')).toBe('passed');
            expect(mockContext.metadata.get('protected_record_count')).toBe(1);
            expect(mockContext.metadata.get('trashed_record_count')).toBe(0);
            expect(mockContext.metadata.get('deleted_record_count')).toBe(0);
        });
    });
    describe('Helper Methods', () => {
        test('isRecordTrashed should correctly identify trashed records', () => {
            expect(SoftDeleteProtector.isRecordTrashed({ trashed_at: null })).toBe(false);
            expect(SoftDeleteProtector.isRecordTrashed({ trashed_at: undefined })).toBe(false);
            expect(SoftDeleteProtector.isRecordTrashed({ trashed_at: '2024-01-01' })).toBe(true);
            expect(SoftDeleteProtector.isRecordTrashed({})).toBe(false);
            expect(SoftDeleteProtector.isRecordTrashed(null)).toBe(false);
        });
        test('isRecordDeleted should correctly identify deleted records', () => {
            expect(SoftDeleteProtector.isRecordDeleted({ deleted_at: null })).toBe(false);
            expect(SoftDeleteProtector.isRecordDeleted({ deleted_at: undefined })).toBe(false);
            expect(SoftDeleteProtector.isRecordDeleted({ deleted_at: '2024-01-01' })).toBe(true);
            expect(SoftDeleteProtector.isRecordDeleted({})).toBe(false);
            expect(SoftDeleteProtector.isRecordDeleted(null)).toBe(false);
        });
        test('canModifyRecord should correctly identify modifiable records', () => {
            expect(SoftDeleteProtector.canModifyRecord({ trashed_at: null, deleted_at: null })).toBe(true);
            expect(SoftDeleteProtector.canModifyRecord({ trashed_at: '2024-01-01', deleted_at: null })).toBe(false);
            expect(SoftDeleteProtector.canModifyRecord({ trashed_at: null, deleted_at: '2024-01-01' })).toBe(false);
            expect(SoftDeleteProtector.canModifyRecord({ trashed_at: '2024-01-01', deleted_at: '2024-01-02' })).toBe(false);
            expect(SoftDeleteProtector.canModifyRecord(null)).toBe(false);
        });
        test('getProtectionStats should return correct statistics', () => {
            mockContext.metadata.set('soft_delete_protection', 'passed');
            mockContext.metadata.set('protected_record_count', 3);
            mockContext.metadata.set('trashed_record_count', 0);
            mockContext.metadata.set('deleted_record_count', 0);
            const stats = SoftDeleteProtector.getProtectionStats(mockContext);
            expect(stats).toEqual({
                wasChecked: true,
                checkedRecords: 3,
                trashedRecords: 0,
                deletedRecords: 0,
                status: 'passed'
            });
        });
        test('getProtectionStats should handle missing metadata', () => {
            const stats = SoftDeleteProtector.getProtectionStats(mockContext);
            expect(stats).toEqual({
                wasChecked: false,
                checkedRecords: 0,
                trashedRecords: 0,
                deletedRecords: 0,
                status: 'not_checked'
            });
        });
    });
});
//# sourceMappingURL=soft-delete-protector.test.js.map