/**
 * Unit Tests: Record Preloader Observer
 * 
 * Tests the record preloading functionality that efficiently loads existing records
 * for other observers to consume without duplicate database queries.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import RecordPreloader from '@src/observers/all/0/record-preloader.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';

describe('Unit: RecordPreloader Observer', () => {
    let observer: RecordPreloader;
    let mockContext: ObserverContext;

    beforeEach(() => {
        observer = new RecordPreloader();
        
        // Create mock context with minimal required properties
        mockContext = {
            system: {
                info: () => {},
                warn: () => {},
                database: {
                    selectAny: async () => [] // Default empty result
                }
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
            expect(observer.ring).toBe(ObserverRing.Validation);
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

        test('should not execute for select operations', () => {
            expect(observer.shouldExecute('select')).toBe(false);
        });
    });

    describe('ID Extraction', () => {
        test('should extract IDs from update data', async () => {
            mockContext.operation = 'update';
            mockContext.data = [
                { id: 'record-1', name: 'Test 1' },
                { id: 'record-2', name: 'Test 2' },
                { id: 'record-3', name: 'Test 3' }
            ];

            const calls: any[] = [];
            mockContext.system.database.selectAny = async (...args: any[]) => {
                calls.push(args);
                return [];
            };
            
            await observer.execute(mockContext);
            
            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual(['test_schema', {
                where: { id: { $in: ['record-1', 'record-2', 'record-3'] } },
                options: {
                    trashed: true,
                    deleted: true
                }
            }]);
        });

        test('should extract IDs from delete data', async () => {
            mockContext.operation = 'delete';
            mockContext.data = [
                { id: 'delete-1' },
                { id: 'delete-2' }
            ];

            const calls: any[] = [];
            mockContext.system.database.selectAny = async (...args: any[]) => {
                calls.push(args);
                return [];
            };
            
            await observer.execute(mockContext);
            
            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual(['test_schema', {
                where: { id: { $in: ['delete-1', 'delete-2'] } },
                options: {
                    trashed: true,
                    deleted: true
                }
            }]);
        });

        test('should extract IDs from revert data (ID strings)', async () => {
            mockContext.operation = 'revert';
            mockContext.data = ['revert-1', 'revert-2', 'revert-3'];

            const calls: any[] = [];
            mockContext.system.database.selectAny = async (...args: any[]) => {
                calls.push(args);
                return [];
            };
            
            await observer.execute(mockContext);
            
            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual(['test_schema', {
                where: { id: { $in: ['revert-1', 'revert-2', 'revert-3'] } },
                options: {
                    trashed: true,
                    deleted: true
                }
            }]);
        });

        test('should extract IDs from revert data (objects with ID)', async () => {
            mockContext.operation = 'revert';
            mockContext.data = [
                { id: 'revert-obj-1', trashed_at: null },
                { id: 'revert-obj-2', trashed_at: null }
            ];

            const calls: any[] = [];
            mockContext.system.database.selectAny = async (...args: any[]) => {
                calls.push(args);
                return [];
            };
            
            await observer.execute(mockContext);
            
            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual(['test_schema', {
                where: { id: { $in: ['revert-obj-1', 'revert-obj-2'] } },
                options: {
                    trashed: true,
                    deleted: true
                }
            }]);
        });

        test('should handle empty data arrays', async () => {
            mockContext.data = [];
            
            await observer.execute(mockContext);
            
            // Should not call database when no IDs are found
            expect(mockContext.metadata.has('existing_records')).toBe(false);
        });

        test('should handle data without IDs', async () => {
            mockContext.operation = 'update';
            mockContext.data = [
                { name: 'No ID 1' },
                { name: 'No ID 2' }
            ];
            
            await observer.execute(mockContext);
            
            // Should not call database when no IDs are found
            expect(mockContext.metadata.has('existing_records')).toBe(false);
        });

        test('should deduplicate IDs', async () => {
            mockContext.operation = 'update';
            mockContext.data = [
                { id: 'duplicate-1', name: 'Test 1' },
                { id: 'duplicate-2', name: 'Test 2' },
                { id: 'duplicate-1', name: 'Test 1 again' }, // Duplicate
                { id: 'duplicate-2', name: 'Test 2 again' }  // Duplicate
            ];

            const calls: any[] = [];
            mockContext.system.database.selectAny = async (...args: any[]) => {
                calls.push(args);
                return [];
            };
            
            await observer.execute(mockContext);
            
            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual(['test_schema', {
                where: { id: { $in: ['duplicate-1', 'duplicate-2'] } },
                options: {
                    trashed: true,
                    deleted: true
                }
            }]);
        });

        test('should filter out empty and null IDs', async () => {
            mockContext.operation = 'update';
            mockContext.data = [
                { id: 'valid-id', name: 'Valid' },
                { id: '', name: 'Empty ID' },
                { id: null, name: 'Null ID' },
                { id: '   ', name: 'Whitespace ID' },
                { id: undefined, name: 'Undefined ID' }
            ];

            const calls: any[] = [];
            mockContext.system.database.selectAny = async (...args: any[]) => {
                calls.push(args);
                return [];
            };
            
            await observer.execute(mockContext);
            
            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual(['test_schema', {
                where: { id: { $in: ['valid-id'] } },
                options: {
                    trashed: true,
                    deleted: true
                }
            }]);
        });
    });

    describe('Metadata Storage', () => {
        test('should store preloaded records as frozen arrays', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Test 1', trashed_at: null },
                { id: 'record-2', name: 'Test 2', trashed_at: '2024-01-01' }
            ];

            mockContext.operation = 'update';
            mockContext.data = [{ id: 'record-1' }, { id: 'record-2' }];
            mockContext.system.database.selectAny = async () => mockRecords;
            
            await observer.execute(mockContext);
            
            const storedRecords = mockContext.metadata.get('existing_records');
            expect(storedRecords).toEqual(mockRecords);
            expect(Object.isFrozen(storedRecords)).toBe(true);
            expect(Object.isFrozen(storedRecords[0])).toBe(true);
            expect(Object.isFrozen(storedRecords[1])).toBe(true);
        });

        test('should store preloaded records by ID as frozen object', async () => {
            const mockRecords = [
                { id: 'record-1', name: 'Test 1' },
                { id: 'record-2', name: 'Test 2' }
            ];

            mockContext.operation = 'update';
            mockContext.data = [{ id: 'record-1' }, { id: 'record-2' }];
            mockContext.system.database.selectAny = async () => mockRecords;
            
            await observer.execute(mockContext);
            
            const storedById = mockContext.metadata.get('existing_records_by_id');
            expect(storedById).toEqual({
                'record-1': { id: 'record-1', name: 'Test 1' },
                'record-2': { id: 'record-2', name: 'Test 2' }
            });
            expect(Object.isFrozen(storedById)).toBe(true);
            expect(Object.isFrozen(storedById['record-1'])).toBe(true);
            expect(Object.isFrozen(storedById['record-2'])).toBe(true);
        });

        test('should store preload statistics', async () => {
            const mockRecords = [
                { id: 'found-1', name: 'Found 1' }
            ];

            mockContext.operation = 'update';
            mockContext.data = [{ id: 'found-1' }, { id: 'missing-1' }];
            mockContext.system.database.selectAny = async () => mockRecords;
            
            await observer.execute(mockContext);
            
            expect(mockContext.metadata.get('preloaded_record_count')).toBe(1);
            expect(mockContext.metadata.get('requested_record_count')).toBe(2);
            expect(mockContext.metadata.get('preload_error')).toBeUndefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle database errors gracefully', async () => {
            mockContext.operation = 'update';
            mockContext.data = [{ id: 'record-1' }];
            
            // Mock database to throw error
            mockContext.system.database.selectAny = async () => {
                throw new Error('Database connection failed');
            };
            
            // Should not throw, but handle error gracefully
            await expect(observer.execute(mockContext)).resolves.toBeUndefined();
            
            // Should set error metadata
            expect(mockContext.metadata.get('existing_records')).toEqual([]);
            expect(mockContext.metadata.get('existing_records_by_id')).toEqual({});
            expect(mockContext.metadata.get('preloaded_record_count')).toBe(0);
            expect(mockContext.metadata.get('preload_error')).toBe(true);
        });

        test('should handle null/undefined database responses', async () => {
            mockContext.operation = 'update';
            mockContext.data = [{ id: 'record-1' }];
            mockContext.system.database.selectAny = async () => null;
            
            await observer.execute(mockContext);
            
            expect(mockContext.metadata.get('existing_records')).toEqual([]);
            expect(mockContext.metadata.get('existing_records_by_id')).toEqual({});
            expect(mockContext.metadata.get('preload_error')).toBe(true);
        });
    });

    describe('Helper Methods', () => {
        test('getPreloadedRecords should return empty array when no preload data', () => {
            const records = RecordPreloader.getPreloadedRecords(mockContext);
            expect(records).toEqual([]);
        });

        test('getPreloadedRecordsById should return empty object when no preload data', () => {
            const recordsById = RecordPreloader.getPreloadedRecordsById(mockContext);
            expect(recordsById).toEqual({});
        });

        test('hasPreloadError should return false when no error', () => {
            expect(RecordPreloader.hasPreloadError(mockContext)).toBe(false);
        });

        test('hasPreloadError should return true when error occurred', () => {
            mockContext.metadata.set('preload_error', true);
            expect(RecordPreloader.hasPreloadError(mockContext)).toBe(true);
        });

        test('getPreloadStats should return correct statistics', () => {
            mockContext.metadata.set('requested_record_count', 5);
            mockContext.metadata.set('preloaded_record_count', 3);
            mockContext.metadata.set('preload_error', true);
            
            const stats = RecordPreloader.getPreloadStats(mockContext);
            expect(stats).toEqual({
                requestedCount: 5,
                foundCount: 3,
                hasError: true
            });
        });
    });
});

