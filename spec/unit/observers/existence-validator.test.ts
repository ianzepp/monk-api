/**
 * Unit Tests: Existence Validator Observer
 * 
 * Tests the record existence validation functionality that ensures all requested
 * records exist before performing operations, using preloaded record data.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import ExistenceValidator from '@src/observers/all/2/existence-validator.js';
import { BusinessLogicError } from '@lib/observers/errors.js';
import { ObserverRing } from '@lib/observers/types.js';
import type { ObserverContext } from '@lib/observers/interfaces.js';

describe('Unit: ExistenceValidator Observer', () => {
    let observer: ExistenceValidator;
    let mockContext: ObserverContext;

    beforeEach(() => {
        observer = new ExistenceValidator();
        
        // Create mock context with minimal required properties
        mockContext = {
            system: {
                info: () => {},
                warn: () => {}
            } as any,
            schemaName: 'test_schema',
            schema: {} as any,
            operation: 'update' as any,
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
            expect(observer.operations).toEqual(['update', 'delete', 'revert']);
        });

        test('should execute for update operations', () => {
            expect(observer.shouldExecute('update')).toBe(true);
        });

        test('should execute for delete operations', () => {
            expect(observer.shouldExecute('delete')).toBe(true);
        });

        test('should execute for revert operations', () => {
            expect(observer.shouldExecute('revert')).toBe(true);
        });

        test('should not execute for create operations', () => {
            expect(observer.shouldExecute('create')).toBe(false);
        });
    });

    describe('No IDs Handling', () => {
        test('should skip validation when no IDs found', async () => {
            mockContext.data = [];
            
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('existence_validation')).toBe('skipped_no_ids');
        });

        test('should skip validation when data has no IDs', async () => {
            mockContext.operation = 'update';
            mockContext.data = [
                { name: 'No ID 1' },
                { name: 'No ID 2' }
            ];
            
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('existence_validation')).toBe('skipped_no_ids');
        });
    });

    describe('Preload Error Handling', () => {
        test('should throw error when preload failed', async () => {
            mockContext.data = [{ id: 'test-1' }];
            mockContext.metadata.set('preload_error', true);
            mockContext.metadata.set('requested_record_count', 1);
            
            await expect(observer.execute(mockContext)).rejects.toThrow(BusinessLogicError);
            
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error).toBeInstanceOf(BusinessLogicError);
                expect((error as BusinessLogicError).message).toContain('Cannot validate record existence');
                expect((error as BusinessLogicError).code).toBe('EXISTENCE_VALIDATION_FAILED');
            }
        });
    });

    describe('Existence Validation', () => {
        test('should pass when all requested records exist', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Exists 1' },
                { id: 'record-2', name: 'Exists 2' }
            ];
            
            mockContext.operation = 'update';
            mockContext.data = [
                { id: 'record-1', update: 'data' },
                { id: 'record-2', update: 'data' }
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            
            expect(mockContext.metadata.get('existence_validation')).toBe('passed');
            expect(mockContext.metadata.get('validated_record_count')).toBe(2);
            expect(mockContext.metadata.get('missing_record_count')).toBe(0);
        });

        test('should throw error when some records are missing', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Exists' }
                // record-2 is missing
            ];
            
            mockContext.operation = 'update';
            mockContext.data = [
                { id: 'record-1', update: 'data' },
                { id: 'record-2', update: 'data' }  // This one doesn't exist
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).rejects.toThrow(BusinessLogicError);
            
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error).toBeInstanceOf(BusinessLogicError);
                expect((error as BusinessLogicError).message).toContain('Cannot update - Record not found: record-2');
                expect((error as BusinessLogicError).code).toBe('RECORD_NOT_FOUND');
            }
        });

        test('should throw error when multiple records are missing', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Exists' }
                // record-2 and record-3 are missing
            ];
            
            mockContext.operation = 'delete';
            mockContext.data = [
                { id: 'record-1' },
                { id: 'record-2' },  // Missing
                { id: 'record-3' }   // Missing
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).rejects.toThrow(BusinessLogicError);
            
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect((error as BusinessLogicError).message).toContain('Cannot delete - Records not found: record-2, record-3');
            }
        });

        test('should handle single missing record with singular message', async () => {
            const mockRecords = [];  // No existing records
            
            mockContext.operation = 'update';
            mockContext.data = [{ id: 'missing-record' }];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).rejects.toThrow(BusinessLogicError);
            
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect((error as BusinessLogicError).message).toContain('Record not found: missing-record');
            }
        });
    });

    describe('Revert Operation Special Validation', () => {
        test('should pass revert when records are trashed', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Trashed', trashed_at: '2024-01-01T00:00:00Z' },
                { id: 'record-2', name: 'Also Trashed', trashed_at: '2024-01-02T00:00:00Z' }
            ];
            
            mockContext.operation = 'revert';
            mockContext.data = ['record-1', 'record-2'];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            
            expect(mockContext.metadata.get('existence_validation')).toBe('passed');
        });

        test('should fail revert when records are not trashed', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Active', trashed_at: null },
                { id: 'record-2', name: 'Also Active', trashed_at: undefined }
            ];
            
            mockContext.operation = 'revert';
            mockContext.data = ['record-1', 'record-2'];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).rejects.toThrow(BusinessLogicError);
            
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error).toBeInstanceOf(BusinessLogicError);
                expect((error as BusinessLogicError).message).toContain('Cannot revert non-trashed records: record-1, record-2');
                expect((error as BusinessLogicError).code).toBe('CANNOT_REVERT_NON_TRASHED');
            }
        });

        test('should fail revert when some records are not trashed', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Trashed', trashed_at: '2024-01-01T00:00:00Z' },
                { id: 'record-2', name: 'Active', trashed_at: null }
            ];
            
            mockContext.operation = 'revert';
            mockContext.data = ['record-1', 'record-2'];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).rejects.toThrow(BusinessLogicError);
            
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect((error as BusinessLogicError).message).toContain('Cannot revert non-trashed records: record-2');
            }
        });
    });

    describe('Different Data Formats', () => {
        test('should handle revert with ID strings', async () => {
            const mockRecords = [
                { id: 'revert-1', trashed_at: '2024-01-01' },
                { id: 'revert-2', trashed_at: '2024-01-02' }
            ];
            
            mockContext.operation = 'revert';
            mockContext.data = ['revert-1', 'revert-2'];  // Array of strings
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('existence_validation')).toBe('passed');
        });

        test('should handle revert with objects containing IDs', async () => {
            const mockRecords = [
                { id: 'revert-1', trashed_at: '2024-01-01' },
                { id: 'revert-2', trashed_at: '2024-01-02' }
            ];
            
            mockContext.operation = 'revert';
            mockContext.data = [
                { id: 'revert-1', trashed_at: null },  // Array of objects
                { id: 'revert-2', trashed_at: null }
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('existence_validation')).toBe('passed');
        });

        test('should handle mixed data types', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Mixed', trashed_at: null }
            ];
            
            mockContext.operation = 'update';
            mockContext.data = [
                { id: 'record-1', update: 'data' },
                { other_field: 'no_id' },  // Should be ignored
                null,                       // Should be ignored
                undefined                   // Should be ignored
            ];
            mockContext.metadata.set('existing_records', Object.freeze(mockRecords));
            
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            expect(mockContext.metadata.get('existence_validation')).toBe('passed');
        });
    });

    describe('Helper Methods', () => {
        test('recordExists should check preloaded records', () => {
            mockContext.metadata.set('existing_records_by_id', Object.freeze({
                'exists-1': { id: 'exists-1', name: 'Exists' }
            }));
            
            expect(ExistenceValidator.recordExists(mockContext, 'exists-1')).toBe(true);
            expect(ExistenceValidator.recordExists(mockContext, 'missing-1')).toBe(false);
        });

        test('getExistingRecord should return record from preloaded data', () => {
            const record = { id: 'exists-1', name: 'Exists' };
            mockContext.metadata.set('existing_records_by_id', Object.freeze({
                'exists-1': Object.freeze(record)
            }));
            
            expect(ExistenceValidator.getExistingRecord(mockContext, 'exists-1')).toEqual(record);
            expect(ExistenceValidator.getExistingRecord(mockContext, 'missing-1')).toBe(null);
        });

        test('getValidationStats should return correct statistics', () => {
            mockContext.metadata.set('existence_validation', 'passed');
            mockContext.metadata.set('requested_record_count', 5);
            mockContext.metadata.set('validated_record_count', 5);
            mockContext.metadata.set('missing_record_count', 0);
            
            const stats = ExistenceValidator.getValidationStats(mockContext);
            expect(stats).toEqual({
                wasValidated: true,
                requestedCount: 5,
                foundCount: 5,
                missingCount: 0,
                status: 'passed'
            });
        });

        test('getValidationStats should handle missing metadata', () => {
            const stats = ExistenceValidator.getValidationStats(mockContext);
            expect(stats).toEqual({
                wasValidated: false,
                requestedCount: 0,
                foundCount: 0,
                missingCount: 0,
                status: 'not_validated'
            });
        });
    });
});