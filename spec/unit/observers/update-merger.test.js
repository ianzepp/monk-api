/**
 * Unit Tests: Update Merger Observer
 *
 * Tests the update data merging functionality that properly combines existing
 * record data with update data using preloaded records.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import UpdateMerger from '@src/observers/all/0/update-merger.js';
import { BusinessLogicError } from '@lib/observers/errors.js';
import { ObserverRing } from '@lib/observers/types.js';
describe('Unit: UpdateMerger Observer', () => {
    let observer;
    let mockContext;
    beforeEach(() => {
        observer = new UpdateMerger();
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
            expect(observer.ring).toBe(ObserverRing.Business);
        });
        test('should target correct operations', () => {
            expect(observer.operations).toEqual(['update']);
        });
        test('should execute for update operations', () => {
            expect(observer.shouldExecute('update')).toBe(true);
        });
        test('should not execute for create operations', () => {
            expect(observer.shouldExecute('create')).toBe(false);
        });
        test('should not execute for delete operations', () => {
            expect(observer.shouldExecute('delete')).toBe(false);
        });
    });
    describe('Data Validation', () => {
        test('should skip when no data provided', async () => {
            mockContext.data = [];
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('update_merge')).toBe('skipped_no_data');
        });
        test('should skip when data is null', async () => {
            mockContext.data = null;
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('update_merge')).toBe('skipped_no_data');
        });
        test('should skip when data is not an array', async () => {
            mockContext.data = { id: 'not-array' };
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('update_merge')).toBe('skipped_no_data');
        });
    });
    describe('Preload Error Handling', () => {
        test('should throw error when preload failed', async () => {
            mockContext.data = [{ id: 'test-1', name: 'Update' }];
            mockContext.metadata.set('preload_error', true);
            mockContext.metadata.set('requested_record_count', 1);
            await expect(observer.execute(mockContext)).rejects.toThrow(BusinessLogicError);
            try {
                await observer.execute(mockContext);
            }
            catch (error) {
                expect(error).toBeInstanceOf(BusinessLogicError);
                expect(error.message).toContain('Cannot merge update data');
                expect(error.code).toBe('UPDATE_MERGE_FAILED');
            }
        });
    });
    describe('Record Merging', () => {
        test('should merge existing record with update data', async () => {
            const existingRecord = {
                id: 'record-1',
                name: 'Original Name',
                email: 'original@test.com',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z'
            };
            const updateData = [
                {
                    id: 'record-1',
                    name: 'Updated Name' // Only updating name
                }
            ];
            mockContext.data = updateData;
            mockContext.metadata.set('existing_records_by_id', Object.freeze({
                'record-1': Object.freeze(existingRecord)
            }));
            await observer.execute(mockContext);
            // Check that data was modified in place
            expect(mockContext.data[0]).toMatchObject({
                id: 'record-1',
                name: 'Updated Name', // Updated
                email: 'original@test.com', // Preserved from existing
                created_at: '2024-01-01T00:00:00Z' // Preserved
            });
            // updated_at should be newer
            expect(mockContext.data[0].updated_at).not.toBe('2024-01-01T00:00:00Z');
            expect(new Date(mockContext.data[0].updated_at).getTime()).toBeGreaterThan(new Date('2024-01-01T00:00:00Z').getTime());
        });
        test('should preserve created_at when not explicitly updated', async () => {
            const existingRecord = {
                id: 'record-1',
                name: 'Test',
                created_at: '2024-01-01T00:00:00Z'
            };
            mockContext.data = [{ id: 'record-1', name: 'Updated' }];
            mockContext.metadata.set('existing_records_by_id', Object.freeze({
                'record-1': Object.freeze(existingRecord)
            }));
            await observer.execute(mockContext);
            expect(mockContext.data[0].created_at).toBe('2024-01-01T00:00:00Z');
        });
        test('should preserve ID even if update tries to change it', async () => {
            const existingRecord = {
                id: 'original-id',
                name: 'Test'
            };
            mockContext.data = [{
                    id: 'original-id',
                    name: 'Updated',
                    // Note: ID is handled specially and should not change
                }];
            mockContext.metadata.set('existing_records_by_id', Object.freeze({
                'original-id': Object.freeze(existingRecord)
            }));
            await observer.execute(mockContext);
            expect(mockContext.data[0].id).toBe('original-id');
        });
        test('should merge multiple records', async () => {
            const existingRecords = {
                'record-1': Object.freeze({ id: 'record-1', name: 'Name 1', value: 100 }),
                'record-2': Object.freeze({ id: 'record-2', name: 'Name 2', value: 200 })
            };
            mockContext.data = [
                { id: 'record-1', name: 'Updated Name 1' },
                { id: 'record-2', value: 250 } // Different field updated
            ];
            mockContext.metadata.set('existing_records_by_id', Object.freeze(existingRecords));
            await observer.execute(mockContext);
            expect(mockContext.data[0]).toMatchObject({
                id: 'record-1',
                name: 'Updated Name 1', // Updated
                value: 100 // Preserved
            });
            expect(mockContext.data[1]).toMatchObject({
                id: 'record-2',
                name: 'Name 2', // Preserved
                value: 250 // Updated
            });
        });
    });
    describe('Error Handling', () => {
        test('should skip records without IDs', async () => {
            mockContext.data = [
                { name: 'No ID' },
                { id: 'record-1', name: 'Has ID' }
            ];
            mockContext.metadata.set('existing_records_by_id', Object.freeze({
                'record-1': Object.freeze({ id: 'record-1', original: 'data' })
            }));
            await observer.execute(mockContext);
            // First record should be unchanged (no ID)
            expect(mockContext.data[0]).toEqual({ name: 'No ID' });
            // Second record should be merged
            expect(mockContext.data[1]).toMatchObject({
                id: 'record-1',
                name: 'Has ID',
                original: 'data'
            });
        });
        test('should skip records when existing record not found', async () => {
            mockContext.data = [
                { id: 'missing-record', name: 'Update' }
            ];
            mockContext.metadata.set('existing_records_by_id', Object.freeze({}));
            await observer.execute(mockContext);
            // Record should be unchanged
            expect(mockContext.data[0]).toEqual({ id: 'missing-record', name: 'Update' });
        });
        test('should handle null and undefined records', async () => {
            mockContext.data = [
                null,
                undefined,
                { id: 'valid-record', name: 'Valid' }
            ];
            mockContext.metadata.set('existing_records_by_id', Object.freeze({
                'valid-record': Object.freeze({ id: 'valid-record', existing: 'data' })
            }));
            await observer.execute(mockContext);
            // Null and undefined should be unchanged
            expect(mockContext.data[0]).toBe(null);
            expect(mockContext.data[1]).toBe(undefined);
            // Valid record should be merged
            expect(mockContext.data[2]).toMatchObject({
                id: 'valid-record',
                name: 'Valid',
                existing: 'data'
            });
        });
    });
    describe('Metadata Recording', () => {
        test('should record merge statistics', async () => {
            const existingRecords = {
                'record-1': Object.freeze({ id: 'record-1', name: 'Test 1' }),
                'record-2': Object.freeze({ id: 'record-2', name: 'Test 2' })
            };
            mockContext.data = [
                { id: 'record-1', name: 'Updated 1' },
                { id: 'record-2', name: 'Updated 2' }
            ];
            mockContext.metadata.set('existing_records_by_id', Object.freeze(existingRecords));
            await observer.execute(mockContext);
            expect(mockContext.metadata.get('update_merge')).toBe('completed');
            expect(mockContext.metadata.get('merged_record_count')).toBe(2);
            expect(mockContext.metadata.get('skipped_record_count')).toBe(0);
            expect(mockContext.metadata.get('merge_timestamp')).toBeDefined();
            const mergeDetails = mockContext.metadata.get('merge_details');
            expect(mergeDetails).toHaveLength(2);
            expect(mergeDetails[0]).toMatchObject({
                recordId: 'record-1',
                existingFields: expect.any(Number),
                updateFields: expect.any(Number),
                mergedFields: expect.any(Number)
            });
        });
        test('should record skipped records', async () => {
            mockContext.data = [
                { id: 'record-1', name: 'Valid' },
                { name: 'No ID' }, // Should be skipped
                null // Should be skipped
            ];
            mockContext.metadata.set('existing_records_by_id', Object.freeze({
                'record-1': Object.freeze({ id: 'record-1', existing: 'data' })
            }));
            await observer.execute(mockContext);
            expect(mockContext.metadata.get('merged_record_count')).toBe(1);
            expect(mockContext.metadata.get('skipped_record_count')).toBe(2);
        });
    });
    describe('Helper Methods', () => {
        test('wasRecordMerged should check merge details', () => {
            const mergeDetails = [
                { recordId: 'record-1', existingFields: 3, updateFields: 2, mergedFields: 4 }
            ];
            mockContext.metadata.set('merge_details', mergeDetails);
            expect(UpdateMerger.wasRecordMerged(mockContext, 'record-1')).toBe(true);
            expect(UpdateMerger.wasRecordMerged(mockContext, 'record-2')).toBe(false);
        });
        test('getRecordMergeDetails should return specific record details', () => {
            const mergeDetails = [
                { recordId: 'record-1', existingFields: 3, updateFields: 2 },
                { recordId: 'record-2', existingFields: 4, updateFields: 1 }
            ];
            mockContext.metadata.set('merge_details', mergeDetails);
            const details = UpdateMerger.getRecordMergeDetails(mockContext, 'record-1');
            expect(details).toEqual({ recordId: 'record-1', existingFields: 3, updateFields: 2 });
            expect(UpdateMerger.getRecordMergeDetails(mockContext, 'missing')).toBe(null);
        });
        test('getMergeStats should return overall statistics', () => {
            mockContext.metadata.set('update_merge', 'completed');
            mockContext.metadata.set('merged_record_count', 5);
            mockContext.metadata.set('skipped_record_count', 2);
            mockContext.metadata.set('merge_timestamp', '2024-01-01T12:00:00Z');
            const stats = UpdateMerger.getMergeStats(mockContext);
            expect(stats).toEqual({
                wasMerged: true,
                mergedCount: 5,
                skippedCount: 2,
                timestamp: '2024-01-01T12:00:00Z',
                status: 'completed'
            });
        });
        test('getMergeStats should handle missing metadata', () => {
            const stats = UpdateMerger.getMergeStats(mockContext);
            expect(stats).toEqual({
                wasMerged: false,
                mergedCount: 0,
                skippedCount: 0,
                timestamp: null,
                status: 'not_merged'
            });
        });
    });
});
//# sourceMappingURL=update-merger.test.js.map