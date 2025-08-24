/**
 * Unit Tests: SQL Observer
 * 
 * Tests the SQL transport layer that handles direct database operations
 * using parameterized queries after data has been processed by earlier rings.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { SqlObserver } from '@lib/observers/sql-observer.js';
import { SystemError } from '@lib/observers/errors.js';
import { ObserverRing } from '@lib/observers/types.js';
import type { ObserverContext } from '@lib/observers/interfaces.js';

describe('Unit: SQL Observer', () => {
    let observer: SqlObserver;
    let mockContext: ObserverContext;
    let mockQueryResults: any[];

    beforeEach(() => {
        observer = new SqlObserver();
        mockQueryResults = [];
        
        // Create mock context with database connection
        mockContext = {
            system: {
                info: () => {},
                warn: () => {},
                db: {
                    query: async (query: string, params?: any[]) => {
                        // Store query details for verification
                        mockQueryResults.push({ query, params });
                        // Return mock result based on query type
                        if (query.includes('INSERT')) {
                            return { rows: [{ id: 'new-record-id', name: 'Test Record' }] };
                        } else if (query.includes('UPDATE')) {
                            return { rows: [{ id: 'updated-record-id', name: 'Updated Record' }] };
                        } else if (query.includes('SELECT')) {
                            return { rows: [{ id: 'selected-record', name: 'Selected' }] };
                        }
                        return { rows: [] };
                    },
                    connect: async () => ({
                        query: async () => ({ rows: [] }),
                        release: () => {}
                    })
                },
                tx: undefined
            } as any,
            schemaName: 'test_schema',
            schema: {} as any,
            operation: 'create' as any,
            data: [],
            metadata: new Map(),
            errors: [],
            warnings: [],
            startTime: Date.now()
        };
    });

    describe('Configuration', () => {
        test('should have correct ring assignment', () => {
            expect(observer.ring).toBe(ObserverRing.Database);
        });

        test('should support all database operations', () => {
            expect(observer.operations).toEqual(['create', 'update', 'delete', 'select', 'revert']);
        });

        test('should execute for create operations', () => {
            expect(observer.shouldExecute('create')).toBe(true);
        });

        test('should execute for update operations', () => {
            expect(observer.shouldExecute('update')).toBe(true);
        });

        test('should execute for delete operations', () => {
            expect(observer.shouldExecute('delete')).toBe(true);
        });

        test('should execute for select operations', () => {
            expect(observer.shouldExecute('select')).toBe(true);
        });

        test('should execute for revert operations', () => {
            expect(observer.shouldExecute('revert')).toBe(true);
        });
    });

    describe('Operation Routing', () => {
        test('should route create operations to bulkCreate', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ name: 'Test Record' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            expect(mockQueryResults[0].query).toContain('INSERT INTO');
            expect(mockContext.result).toBeDefined();
        });

        test('should route update operations to bulkUpdate', async () => {
            mockContext.operation = 'update';
            mockContext.data = [{ id: 'test-id', name: 'Updated' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            expect(mockQueryResults[0].query).toContain('UPDATE');
            expect(mockContext.result).toBeDefined();
        });

        test('should route delete operations to bulkDelete', async () => {
            mockContext.operation = 'delete';
            mockContext.data = [{ id: 'test-id' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            expect(mockQueryResults[0].query).toContain('UPDATE');
            expect(mockQueryResults[0].query).toContain('trashed_at = NOW()');
            expect(mockContext.result).toBeDefined();
        });

        test('should route select operations to bulkSelect', async () => {
            mockContext.operation = 'select';
            mockContext.data = [{}]; // Filter data
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            expect(mockQueryResults[0].query).toContain('SELECT');
            expect(mockContext.result).toBeDefined();
        });

        test('should route revert operations to bulkRevert', async () => {
            mockContext.operation = 'revert';
            mockContext.data = [{ id: 'test-id' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            expect(mockQueryResults[0].query).toContain('UPDATE');
            expect(mockQueryResults[0].query).toContain('trashed_at = NULL');
            expect(mockContext.result).toBeDefined();
        });

        test('should throw error for unsupported operations', async () => {
            mockContext.operation = 'invalid' as any;
            
            await expect(observer.execute(mockContext)).rejects.toThrow(SystemError);
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error.originalError?.message).toContain('Unsupported SQL operation: invalid');
            }
        });
    });

    describe('Create Operations', () => {
        beforeEach(() => {
            mockContext.operation = 'create';
        });

        test('should handle empty record arrays', async () => {
            mockContext.data = [];
            
            await observer.execute(mockContext);
            
            expect(mockContext.result).toEqual([]);
            expect(mockQueryResults).toHaveLength(0);
        });

        test('should generate IDs for records without IDs', async () => {
            mockContext.data = [{ name: 'Test Record' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { params } = mockQueryResults[0];
            expect(params[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });

        test('should preserve existing IDs', async () => {
            const existingId = 'existing-id-123';
            mockContext.data = [{ id: existingId, name: 'Test Record' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { params } = mockQueryResults[0];
            expect(params[0]).toBe(existingId);
        });

        test('should set created_at and updated_at timestamps', async () => {
            mockContext.data = [{ name: 'Test Record' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { query, params } = mockQueryResults[0];
            expect(query).toContain('"created_at"');
            expect(query).toContain('"updated_at"');
            expect(params.some(p => typeof p === 'string' && p.includes('T'))).toBe(true); // ISO timestamp
        });

        test('should use parameterized queries', async () => {
            mockContext.data = [{ name: 'Test Record', email: 'test@example.com' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { query, params } = mockQueryResults[0];
            expect(query).toContain('$1');
            expect(query).toContain('$2');
            expect(params).toBeDefined();
            expect(params.length).toBeGreaterThan(0);
        });

        test('should process UUID arrays when flagged', async () => {
            mockContext.data = [{ access_read: ['uuid1', 'uuid2'] }];
            mockContext.metadata.set('access_read_is_uuid_array', true);
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { params } = mockQueryResults[0];
            // Should find the converted PostgreSQL array format
            expect(params).toContain('{uuid1,uuid2}');
        });

        test('should handle multiple records', async () => {
            mockContext.data = [
                { name: 'Record 1' },
                { name: 'Record 2' },
                { name: 'Record 3' }
            ];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(3); // One INSERT per record
            expect(mockContext.result).toHaveLength(3);
        });
    });

    describe('Update Operations', () => {
        beforeEach(() => {
            mockContext.operation = 'update';
        });

        test('should handle empty record arrays', async () => {
            mockContext.data = [];
            
            await observer.execute(mockContext);
            
            expect(mockContext.result).toEqual([]);
            expect(mockQueryResults).toHaveLength(0);
        });

        test('should require ID field for updates', async () => {
            mockContext.data = [{ name: 'Updated Record' }]; // No ID
            
            await expect(observer.execute(mockContext)).rejects.toThrow(SystemError);
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error.originalError?.message).toContain('must have id field');
            }
        });

        test('should generate UPDATE query with WHERE clause', async () => {
            mockContext.data = [{ id: 'test-id', name: 'Updated Record' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { query } = mockQueryResults[0];
            expect(query).toContain('UPDATE "test_schema" SET');
            expect(query).toContain('"name" = $1');
            expect(query).toContain('WHERE');
        });

        test('should process UUID arrays in updates', async () => {
            mockContext.data = [{ id: 'test-id', access_edit: ['uuid3', 'uuid4'] }];
            mockContext.metadata.set('access_edit_is_uuid_array', true);
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { params } = mockQueryResults[0];
            expect(params).toContain('{uuid3,uuid4}');
        });

        test('should skip records with no fields to update', async () => {
            mockContext.data = [{ id: 'test-id' }]; // Only ID, no update fields
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(0); // No queries executed
            expect(mockContext.result).toEqual([]);
        });

        test('should handle multiple update records', async () => {
            mockContext.data = [
                { id: 'id1', name: 'Updated 1' },
                { id: 'id2', name: 'Updated 2' }
            ];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(2);
            expect(mockContext.result).toHaveLength(2);
        });
    });

    describe('Delete Operations', () => {
        beforeEach(() => {
            mockContext.operation = 'delete';
        });

        test('should perform soft deletes', async () => {
            mockContext.data = [{ id: 'test-id' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { query } = mockQueryResults[0];
            expect(query).toContain('UPDATE');
            expect(query).toContain('trashed_at = NOW()');
            expect(query).toContain('updated_at = NOW()');
            expect(query).not.toContain('DELETE FROM');
        });

        test('should require ID fields', async () => {
            mockContext.data = [{ name: 'No ID' }];
            
            await expect(observer.execute(mockContext)).rejects.toThrow(SystemError);
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error.originalError?.message).toContain('must have id fields');
            }
        });

        test('should validate affected row count', async () => {
            mockContext.data = [{ id: 'id1' }, { id: 'id2' }];
            // Mock returning only 1 row when 2 expected
            mockContext.system.db.query = async (query: string, params?: any[]) => {
                mockQueryResults.push({ query, params });
                return { rows: [{ id: 'id1' }] };
            };
            
            await expect(observer.execute(mockContext)).rejects.toThrow(SystemError);
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error.originalError?.message).toContain('affected 1 records, expected 2');
            }
        });

        test('should handle bulk deletes', async () => {
            mockContext.data = [{ id: 'id1' }, { id: 'id2' }, { id: 'id3' }];
            mockContext.system.db.query = async (query: string, params?: any[]) => {
                mockQueryResults.push({ query, params });
                return { rows: [{ id: 'id1' }, { id: 'id2' }, { id: 'id3' }] };
            };
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1); // Single bulk query
            expect(mockContext.result).toHaveLength(3);
        });
    });

    describe('Revert Operations', () => {
        beforeEach(() => {
            mockContext.operation = 'revert';
        });

        test('should revert soft deletes', async () => {
            mockContext.data = [{ id: 'test-id' }];
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            const { query } = mockQueryResults[0];
            expect(query).toContain('UPDATE');
            expect(query).toContain('trashed_at = NULL');
            expect(query).toContain('trashed_at" IS NOT NULL');
        });

        test('should handle ID strings directly', async () => {
            mockContext.data = ['id1', 'id2', 'id3']; // Array of ID strings
            mockContext.system.db.query = async (query: string, params?: any[]) => {
                mockQueryResults.push({ query, params });
                return { rows: [{ id: 'id1' }, { id: 'id2' }, { id: 'id3' }] };
            };
            
            await observer.execute(mockContext);
            
            expect(mockQueryResults).toHaveLength(1);
            expect(mockContext.result).toHaveLength(3);
        });

        test('should validate affected row count', async () => {
            mockContext.data = ['id1', 'id2'];
            mockContext.system.db.query = async (query: string, params?: any[]) => {
                mockQueryResults.push({ query, params });
                return { rows: [{ id: 'id1' }] };
            };
            
            await expect(observer.execute(mockContext)).rejects.toThrow(SystemError);
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error.originalError?.message).toContain('affected 1 records, expected 2');
            }
        });
    });

    describe('UUID Array Processing', () => {
        test('should process access_read arrays', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ access_read: ['uuid1', 'uuid2', 'uuid3'] }];
            mockContext.metadata.set('access_read_is_uuid_array', true);
            
            await observer.execute(mockContext);
            
            const { params } = mockQueryResults[0];
            expect(params).toContain('{uuid1,uuid2,uuid3}');
        });

        test('should process access_edit arrays', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ access_edit: ['uuid4', 'uuid5'] }];
            mockContext.metadata.set('access_edit_is_uuid_array', true);
            
            await observer.execute(mockContext);
            
            const { params } = mockQueryResults[0];
            expect(params).toContain('{uuid4,uuid5}');
        });

        test('should process access_full arrays', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ access_full: ['uuid6'] }];
            mockContext.metadata.set('access_full_is_uuid_array', true);
            
            await observer.execute(mockContext);
            
            const { params } = mockQueryResults[0];
            expect(params).toContain('{uuid6}');
        });

        test('should process access_deny arrays', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ access_deny: ['uuid7', 'uuid8'] }];
            mockContext.metadata.set('access_deny_is_uuid_array', true);
            
            await observer.execute(mockContext);
            
            const { params } = mockQueryResults[0];
            expect(params).toContain('{uuid7,uuid8}');
        });

        test('should not process arrays without metadata flags', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ access_read: ['uuid1', 'uuid2'] }];
            // No metadata flag set
            
            await observer.execute(mockContext);
            
            const { params } = mockQueryResults[0];
            expect(params.some(p => Array.isArray(p) && p.includes('uuid1'))).toBe(true); // Original array
            expect(params).not.toContain('{uuid1,uuid2}'); // Not PostgreSQL format
        });

        test('should handle empty UUID arrays', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ access_read: [] }];
            mockContext.metadata.set('access_read_is_uuid_array', true);
            
            await observer.execute(mockContext);
            
            const { params } = mockQueryResults[0];
            expect(params).toContain('{}'); // Empty PostgreSQL array
        });
    });

    describe('Error Handling', () => {
        test('should wrap database errors in SystemError', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ name: 'Test' }];
            mockContext.system.db.query = async () => {
                throw new Error('Database connection failed');
            };
            
            await expect(observer.execute(mockContext)).rejects.toThrow(SystemError);
            await expect(observer.execute(mockContext)).rejects.toThrow('SQL transport failed');
        });

        test('should handle database transaction failures', async () => {
            mockContext.operation = 'create';
            mockContext.data = [{ name: 'Test' }];
            mockContext.system.db.query = async (query: string, params?: any[]) => {
                mockQueryResults.push({ query, params });
                return { rows: [] }; // No rows returned
            };
            
            await expect(observer.execute(mockContext)).rejects.toThrow(SystemError);
            try {
                await observer.execute(mockContext);
            } catch (error) {
                expect(error.originalError?.message).toContain('Failed to create record');
            }
        });
    });
});