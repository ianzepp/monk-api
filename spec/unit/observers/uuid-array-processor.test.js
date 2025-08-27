/**
 * UuidArrayProcessor Unit Tests
 *
 * Tests UUID array field processing logic without requiring database setup.
 * Validates metadata flag setting for PostgreSQL array compatibility.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import UuidArrayProcessor from '@src/observers/all/4/uuid-array-processor.js';
import { ObserverRing } from '@lib/observers/types.js';
describe('UuidArrayProcessor', () => {
    let processor;
    let mockContext;
    beforeEach(() => {
        processor = new UuidArrayProcessor();
        // Create mock context
        mockContext = {
            system: {
                info: vi.fn(),
                warn: vi.fn()
            },
            operation: 'create',
            schemaName: 'test_schema',
            data: [],
            metadata: new Map()
        };
    });
    describe('configuration', () => {
        test('should be configured for enrichment ring', () => {
            expect(processor.ring).toBe(ObserverRing.Enrichment);
            expect(processor.operations).toEqual(['create', 'update']);
        });
        test('should know UUID array fields', () => {
            const fields = processor.getUuidArrayFields();
            expect(fields).toEqual(['access_read', 'access_edit', 'access_full', 'access_deny']);
        });
        test('should identify UUID array fields correctly', () => {
            expect(processor.isUuidArrayField('access_read')).toBe(true);
            expect(processor.isUuidArrayField('access_edit')).toBe(true);
            expect(processor.isUuidArrayField('access_full')).toBe(true);
            expect(processor.isUuidArrayField('access_deny')).toBe(true);
            expect(processor.isUuidArrayField('name')).toBe(false);
            expect(processor.isUuidArrayField('email')).toBe(false);
        });
    });
    describe('UUID array processing', () => {
        test('should process single record with UUID arrays', async () => {
            mockContext.data = [{
                    name: 'Test Record',
                    access_read: ['uuid-1', 'uuid-2'],
                    access_edit: ['uuid-3'],
                    other_field: 'not an array'
                }];
            await processor.execute(mockContext);
            // Should set metadata flags for UUID array fields
            expect(mockContext.metadata.get('access_read_is_uuid_array')).toBe(true);
            expect(mockContext.metadata.get('access_edit_is_uuid_array')).toBe(true);
            expect(mockContext.metadata.get('access_full_is_uuid_array')).toBeUndefined();
            expect(mockContext.metadata.get('access_deny_is_uuid_array')).toBeUndefined();
            // Should set summary metadata
            expect(mockContext.metadata.get('uuid_array_processing')).toBe('completed');
            expect(mockContext.metadata.get('uuid_fields_processed')).toBe(2);
            expect(mockContext.metadata.get('records_with_uuid_arrays')).toBe(1);
        });
        test('should process multiple records with UUID arrays', async () => {
            mockContext.data = [
                {
                    name: 'Record 1',
                    access_read: ['uuid-1'],
                    access_full: ['uuid-2', 'uuid-3']
                },
                {
                    name: 'Record 2',
                    access_edit: ['uuid-4'],
                    access_deny: ['uuid-5', 'uuid-6', 'uuid-7']
                },
                {
                    name: 'Record 3',
                    // No UUID arrays
                }
            ];
            await processor.execute(mockContext);
            // Should set flags for all UUID array fields found
            expect(mockContext.metadata.get('access_read_is_uuid_array')).toBe(true);
            expect(mockContext.metadata.get('access_edit_is_uuid_array')).toBe(true);
            expect(mockContext.metadata.get('access_full_is_uuid_array')).toBe(true);
            expect(mockContext.metadata.get('access_deny_is_uuid_array')).toBe(true);
            // Should count correctly
            expect(mockContext.metadata.get('uuid_fields_processed')).toBe(4);
            expect(mockContext.metadata.get('records_with_uuid_arrays')).toBe(2);
        });
        test('should handle records without UUID arrays', async () => {
            mockContext.data = [
                { name: 'Record 1', email: 'user1@example.com' },
                { name: 'Record 2', email: 'user2@example.com' }
            ];
            await processor.execute(mockContext);
            // Should not set any UUID array flags
            expect(mockContext.metadata.get('access_read_is_uuid_array')).toBeUndefined();
            expect(mockContext.metadata.get('access_edit_is_uuid_array')).toBeUndefined();
            expect(mockContext.metadata.get('access_full_is_uuid_array')).toBeUndefined();
            expect(mockContext.metadata.get('access_deny_is_uuid_array')).toBeUndefined();
            // Should count correctly
            expect(mockContext.metadata.get('uuid_fields_processed')).toBe(0);
            expect(mockContext.metadata.get('records_with_uuid_arrays')).toBe(0);
            // Should not log for zero processing
            expect(mockContext.system.info).not.toHaveBeenCalled();
        });
    });
    describe('field validation', () => {
        test('should only process actual arrays', async () => {
            mockContext.data = [{
                    access_read: 'not-an-array', // String, not array
                    access_edit: null, // Null
                    access_full: undefined, // Undefined
                    access_deny: ['uuid-1'] // Valid array
                }];
            await processor.execute(mockContext);
            // Should only process the valid array
            expect(mockContext.metadata.get('access_read_is_uuid_array')).toBeUndefined();
            expect(mockContext.metadata.get('access_edit_is_uuid_array')).toBeUndefined();
            expect(mockContext.metadata.get('access_full_is_uuid_array')).toBeUndefined();
            expect(mockContext.metadata.get('access_deny_is_uuid_array')).toBe(true);
            expect(mockContext.metadata.get('uuid_fields_processed')).toBe(1);
        });
        test('should handle empty arrays', async () => {
            mockContext.data = [{
                    access_read: [], // Empty array
                    access_edit: ['uuid-1'] // Non-empty array
                }];
            await processor.execute(mockContext);
            // Should process both (empty arrays still need PostgreSQL format)
            expect(mockContext.metadata.get('access_read_is_uuid_array')).toBe(true);
            expect(mockContext.metadata.get('access_edit_is_uuid_array')).toBe(true);
            expect(mockContext.metadata.get('uuid_fields_processed')).toBe(2);
        });
    });
    describe('operation handling', () => {
        test('should handle create operations', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ access_read: ['uuid-1'] }];
            await processor.execute(mockContext);
            expect(mockContext.system.info).toHaveBeenCalledWith('UUID array processing completed', expect.objectContaining({ operation: 'create' }));
        });
        test('should handle update operations', async () => {
            mockContext.operation = 'update';
            mockContext.data = [{ access_edit: ['uuid-1'] }];
            await processor.execute(mockContext);
            expect(mockContext.system.info).toHaveBeenCalledWith('UUID array processing completed', expect.objectContaining({ operation: 'update' }));
        });
    });
    describe('edge cases', () => {
        test('should handle empty data array', async () => {
            mockContext.data = [];
            await processor.execute(mockContext);
            expect(mockContext.metadata.get('uuid_array_processing')).toBe('completed');
            expect(mockContext.metadata.get('uuid_fields_processed')).toBe(0);
            expect(mockContext.metadata.get('records_with_uuid_arrays')).toBe(0);
            // Should not log for zero processing
            expect(mockContext.system.info).not.toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=uuid-array-processor.test.js.map