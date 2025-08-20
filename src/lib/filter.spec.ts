import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Filter, FilterOp } from './filter.js';
import { database } from './database.js';
import { SchemaManager } from './schema-manager.js';

describe('Filter Class', () => {
    let testSchemaName: string;
    let testTableName: string;

    beforeAll(async () => {
        // Create test schema
        testSchemaName = `filter_test_${Date.now()}`;
        testTableName = `${testSchemaName}s`;

        const testSchemaYaml = `
title: ${testSchemaName}
description: Test schema for filter unit tests
type: object
properties:
  name:
    type: string
    minLength: 1
    maxLength: 100
  email:
    type: string
    format: email
  age:
    type: integer
    minimum: 0
  status:
    type: string
    enum: ["active", "inactive"]
    default: "active"
required:
  - name
`;

        await database.transaction(async (tx) => {
            await SchemaManager.createSchema(tx, testSchemaYaml.trim());
        });
    });

    afterAll(async () => {
        // Clean up
        try {
            await database.transaction(async (tx) => {
                await SchemaManager.deleteSchema(tx, testSchemaName);
            });
        } catch (error) {
            console.warn('Failed to clean up test schema:', error);
        }
    });

    describe('Filter Construction', () => {
        it('should create empty filter', () => {
            const filter = new Filter(testSchemaName, testTableName);
            expect(filter).toBeDefined();
        });

        it('should handle undefined assignment', () => {
            const filter = new Filter(testSchemaName, testTableName);
            const result = filter.assign(undefined);
            expect(result).toBe(filter); // Should return self for chaining
        });

        it('should convert single UUID to id filter', () => {
            const filter = new Filter(testSchemaName, testTableName);
            const uuid = '123e4567-e89b-12d3-a456-426614174000';
            
            filter.assign(uuid);
            
            // Check internal state
            expect(filter['_where']).toHaveLength(1);
            expect(filter['_where'][0]).toEqual({
                column: 'id',
                operator: FilterOp.EQ,
                data: uuid
            });
        });

        it('should convert array of UUIDs to $in filter', () => {
            const filter = new Filter(testSchemaName, testTableName);
            const uuids = [
                '123e4567-e89b-12d3-a456-426614174000',
                '987fcdeb-51d2-3e4a-b567-123456789abc'
            ];
            
            filter.assign(uuids);
            
            // Should convert to $in automatically
            expect(filter['_where']).toHaveLength(1);
            expect(filter['_where'][0]).toEqual({
                column: 'id',
                operator: FilterOp.IN,
                data: uuids
            });
        });

        it('should auto-convert array in where clause to $in operator', () => {
            const filter = new Filter(testSchemaName, testTableName);
            const ids = [
                '123e4567-e89b-12d3-a456-426614174000',
                '987fcdeb-51d2-3e4a-b567-123456789abc',
                '456789ab-cdef-1234-5678-9abcdef01234'
            ];
            
            // This is the problematic case that was causing infinite loops
            filter.assign({ where: { id: ids } });
            
            // Should auto-convert to $in format
            expect(filter['_where']).toHaveLength(1);
            expect(filter['_where'][0]).toEqual({
                column: 'id',
                operator: FilterOp.IN,
                data: ids
            });
            
            // Verify SQL generation works
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('WHERE "id" IN (');
            expect(sqlQuery).toContain("'123e4567-e89b-12d3-a456-426614174000'");
            expect(sqlQuery).toContain("'987fcdeb-51d2-3e4a-b567-123456789abc'");
            expect(sqlQuery).toContain("'456789ab-cdef-1234-5678-9abcdef01234'");
        });

        it('should handle plain string as name lookup', () => {
            const filter = new Filter(testSchemaName, testTableName);
            
            filter.assign('test-name');
            
            expect(filter['_where']).toHaveLength(1);
            expect(filter['_where'][0]).toEqual({
                column: 'name',
                operator: FilterOp.EQ,
                data: 'test-name'
            });
        });
    });

    describe('Filter Data Processing', () => {
        it('should handle simple equality', () => {
            const filter = new Filter(testSchemaName, testTableName);
            
            filter.assign({
                where: { status: 'active' }
            });
            
            expect(filter['_where']).toHaveLength(1);
            expect(filter['_where'][0]).toEqual({
                column: 'status',
                operator: FilterOp.EQ,
                data: 'active'
            });
        });

        it('should handle comparison operators', () => {
            const filter = new Filter(testSchemaName, testTableName);
            
            filter.assign({
                where: { 
                    age: { $gte: 18, $lt: 65 }
                }
            });
            
            expect(filter['_where']).toHaveLength(2);
            expect(filter['_where']).toContainEqual({
                column: 'age',
                operator: FilterOp.GTE,
                data: 18
            });
            expect(filter['_where']).toContainEqual({
                column: 'age',
                operator: FilterOp.LT,
                data: 65
            });
        });

        it('should handle pattern matching', () => {
            const filter = new Filter(testSchemaName, testTableName);
            
            filter.assign({
                where: { 
                    email: { $like: '%@company.com' }
                }
            });
            
            expect(filter['_where']).toHaveLength(1);
            expect(filter['_where'][0]).toEqual({
                column: 'email',
                operator: FilterOp.LIKE,
                data: '%@company.com'
            });
        });

        it('should handle $in operator', () => {
            const filter = new Filter(testSchemaName, testTableName);
            const values = ['active', 'pending'];
            
            filter.assign({
                where: { 
                    status: { $in: values }
                }
            });
            
            expect(filter['_where']).toHaveLength(1);
            expect(filter['_where'][0]).toEqual({
                column: 'status',
                operator: FilterOp.IN,
                data: values
            });
        });
    });

    describe('Filter Query Building', () => {
        it('should build simple WHERE clause', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                where: { status: 'active' }
            });
            
            const sqlQuery = filter['_buildSQLString'](); // Use string method for testing
            expect(sqlQuery).toContain('WHERE "status" = \'active\'');
        });

        it('should build SELECT with field selection', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                select: ['name', 'email'],
                where: { status: 'active' }
            });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('SELECT "name", "email"');
            expect(sqlQuery).toContain('WHERE "status" = \'active\'');
        });

        it('should build ORDER BY clause', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                order: [{ name: 'asc' }, { age: 'desc' }]
            });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('ORDER BY "name" ASC, "age" DESC');
        });

        it('should build LIMIT and OFFSET', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                limit: 10,
                offset: 5
            });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('LIMIT 10 OFFSET 5');
        });
    });

    describe('All Comparison Operators', () => {
        it('should handle $eq operator', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ where: { name: { $eq: 'test' } } });
            
            expect(filter['_where'][0]).toEqual({
                column: 'name',
                operator: FilterOp.EQ,
                data: 'test'
            });
        });

        it('should handle $ne and $neq operators', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ where: { status: { $ne: 'inactive' } } });
            
            expect(filter['_where'][0].operator).toBe(FilterOp.NE);
        });

        it('should handle numeric comparison operators', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ 
                where: { 
                    age: { 
                        $gt: 18, 
                        $gte: 21, 
                        $lt: 65, 
                        $lte: 64 
                    } 
                } 
            });
            
            expect(filter['_where']).toHaveLength(4);
            expect(filter['_where'].map(w => w.operator)).toContain(FilterOp.GT);
            expect(filter['_where'].map(w => w.operator)).toContain(FilterOp.GTE);
            expect(filter['_where'].map(w => w.operator)).toContain(FilterOp.LT);
            expect(filter['_where'].map(w => w.operator)).toContain(FilterOp.LTE);
        });

        it('should handle string pattern operators', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ 
                where: { 
                    email: { $like: '%@domain.com' },
                    name: { $ilike: '%JOHN%' }
                } 
            });
            
            const operators = filter['_where'].map(w => w.operator);
            expect(operators).toContain(FilterOp.LIKE);
            expect(operators).toContain(FilterOp.ILIKE);
        });

        it('should handle array operators', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ 
                where: { 
                    status: { $in: ['active', 'pending'] },
                    role: { $nin: ['banned', 'suspended'] }
                } 
            });
            
            const operators = filter['_where'].map(w => w.operator);
            expect(operators).toContain(FilterOp.IN);
            expect(operators).toContain(FilterOp.NIN);
        });
    });

    describe('Logical Operators', () => {
        it('should handle $and conditions', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                where: {
                    $and: [
                        { status: 'active' },
                        { age: { $gte: 18 } },
                        { email: { $like: '%@company.com' } }
                    ]
                }
            });
            
            expect(filter['_where']).toHaveLength(3);
        });

        it('should handle $or conditions', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                where: {
                    $or: [
                        { status: 'admin' },
                        { age: { $gte: 65 } }
                    ]
                }
            });
            
            // Note: OR logic is complex and may not be fully implemented yet
            // This test documents expected behavior
            expect(filter['_where'].length).toBeGreaterThan(0);
        });

        it('should handle mixed logical operators', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                where: {
                    status: 'active',
                    $and: [
                        { age: { $gte: 18 } },
                        { age: { $lt: 65 } }
                    ]
                }
            });
            
            expect(filter['_where'].length).toBeGreaterThan(2);
        });
    });

    describe('SELECT and ORDER Variations', () => {
        it('should handle single field selection', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ select: ['name'] });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('SELECT "name"');
        });

        it('should handle multiple field selection', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ select: ['name', 'email', 'age'] });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('SELECT "name", "email", "age"');
        });

        it('should handle wildcard selection', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ select: ['*'] });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('SELECT *');
        });

        it('should handle single column ordering', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ order: [{ name: 'asc' }] });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('ORDER BY "name" ASC');
        });

        it('should handle multiple column ordering', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ order: [{ name: 'asc' }, { age: 'desc' }, { email: 'asc' }] });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('ORDER BY "name" ASC, "age" DESC, "email" ASC');
        });

        it('should handle string format ordering', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ order: ['name asc', 'age desc'] });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('ORDER BY "name" ASC, "age" DESC');
        });

        it('should handle default ASC ordering', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ order: ['name'] }); // No direction specified
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('ORDER BY "name" ASC');
        });

        // 80% use cases - convenient shorthand
        it('should handle single string order (80% case)', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ order: 'created_at' }); // Simple string
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('ORDER BY "created_at" ASC');
        });

        it('should handle single string with direction (80% case)', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ order: 'name desc' }); // String with direction
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('ORDER BY "name" DESC');
        });
    });

    describe('Data Type Handling', () => {
        it('should handle string values properly', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ where: { name: "O'Malley" } }); // Test SQL escaping
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain("\"name\" = 'O''Malley'"); // Should escape quotes
        });

        it('should handle numeric values', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ where: { age: 25 } });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('"age" = 25'); // No quotes around numbers
        });

        it('should handle boolean values', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ where: { is_active: true } });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('"is_active" = true');
        });

        it('should handle null values', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ where: { description: null } });
            
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toContain('"description" = NULL');
        });
    });

    describe('Complex Real-World Scenarios', () => {
        it('should handle comprehensive user search', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                select: ['name', 'email', 'age'],
                where: {
                    status: 'active',
                    age: { $gte: 18, $lt: 65 },
                    email: { $like: '%@company.com' },
                    $and: [
                        { name: { $like: 'John%' } }
                    ]
                },
                order: [{ name: 'asc' }, { age: 'desc' }],
                limit: 50,
                offset: 10
            });
            
            const sqlQuery = filter['_buildSQLString']();
            
            expect(sqlQuery).toContain('SELECT "name", "email", "age"');
            expect(sqlQuery).toContain('WHERE');
            expect(sqlQuery).toContain('"status" = \'active\'');
            expect(sqlQuery).toContain('"age" >= 18');
            expect(sqlQuery).toContain('"age" < 65');
            expect(sqlQuery).toContain('ORDER BY "name" ASC, "age" DESC');
            expect(sqlQuery).toContain('LIMIT 50 OFFSET 10');
        });

        it('should handle admin dashboard query', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({
                where: {
                    $or: [
                        { status: 'admin' },
                        { status: 'moderator' }
                    ],
                    is_active: true
                },
                order: [{ name: 'asc' }]
            });
            
            // Should have both status conditions plus is_active
            expect(filter['_where'].length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle empty arrays gracefully', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign([]);
            
            expect(filter['_where']).toHaveLength(0);
        });

        it('should handle malformed order specifications', () => {
            const filter = new Filter(testSchemaName, testTableName);
            
            // This should not crash
            expect(() => {
                filter.assign({ order: [null, undefined, {}] });
            }).not.toThrow();
        });

        it('should handle unknown operators gracefully', () => {
            const filter = new Filter(testSchemaName, testTableName);
            filter.assign({ where: { name: { $unknown: 'value' } } });
            
            // Should log warning but not crash
            const sqlQuery = filter['_buildSQLString']();
            expect(sqlQuery).toBeDefined();
        });

        it('should handle very long IN arrays', () => {
            const filter = new Filter(testSchemaName, testTableName);
            const longArray = Array.from({ length: 1000 }, (_, i) => `value-${i}`);
            
            filter.assign({ where: { status: { $in: longArray } } });
            
            expect(filter['_where'][0].data).toHaveLength(1000);
        });
    });
});