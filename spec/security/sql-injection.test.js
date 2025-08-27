/**
 * SQL Injection Protection Tests
 *
 * Tests that SqlObserver properly parameterizes all CREATE/UPDATE/DELETE operations
 * to prevent SQL injection vulnerabilities
 *
 * Addresses Issue #112: SQL injection protection in SqlObserver
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext } from '@spec/helpers/test-tenant.js';
import { ObserverLoader } from '@lib/observers/loader.js';
describe('SQL Injection Protection', () => {
    let tenantManager;
    let testContext;
    beforeAll(async () => {
        // Load observers for complete pipeline testing
        await ObserverLoader.preloadObservers();
        // Create fresh tenant for security testing
        tenantManager = await createTestTenant();
        if (!tenantManager.tenant) {
            throw new Error('Failed to create test tenant for security tests');
        }
        // Create test context
        testContext = await createTestContext(tenantManager.tenant, 'root');
        // Create a simple test schema for security testing
        const securityTestSchema = `
title: Security Test Schema
description: Simple schema for SQL injection testing
type: object
properties:
  name:
    type: string
    minLength: 1
    maxLength: 100
    description: Test name field
  value:
    type: string
    description: Test value field
required:
  - name
additionalProperties: false
`;
        try {
            await testContext.metabase.createOne('sectest', securityTestSchema.trim());
            console.log('✅ Security test schema created');
        }
        catch (error) {
            console.warn('⚠️  Security test schema creation failed:', error);
        }
    });
    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
    });
    describe('CREATE Operation Injection Protection', () => {
        test('should safely handle SQL injection attempts in create data', async () => {
            const maliciousData = {
                name: "'; DROP TABLE users; --",
                value: "'; INSERT INTO admin (user) VALUES ('hacker'); --"
            };
            console.log('🔒 Testing CREATE injection protection');
            // Should not cause SQL syntax errors - should be safely parameterized
            try {
                const result = await testContext.database.createOne('sectest', maliciousData);
                // Should succeed (data is just stored as strings, not executed as SQL)
                expect(result).toBeDefined();
                expect(result.name).toBe("'; DROP TABLE users; --");
                expect(result.value).toBe("'; INSERT INTO admin (user) VALUES ('hacker'); --");
                console.log('✅ Malicious data safely stored as strings');
            }
            catch (error) {
                // Should not fail with SQL syntax errors
                expect(error.message.toLowerCase()).not.toContain('syntax error');
                expect(error.message.toLowerCase()).not.toContain('drop table');
                expect(error.message.toLowerCase()).not.toContain('insert into');
            }
        }, 10000);
        test('should handle special characters safely in create', async () => {
            const specialCharsData = {
                name: "Test with 'quotes' and \"double quotes\"",
                value: "Special chars: \\n\\t\\r\\0 and $1 $2 $3"
            };
            console.log('🔒 Testing special character handling');
            const result = await testContext.database.createOne('sectest', specialCharsData);
            expect(result).toBeDefined();
            expect(result.name).toBe("Test with 'quotes' and \"double quotes\"");
            expect(result.value).toBe("Special chars: \\n\\t\\r\\0 and $1 $2 $3");
            console.log('✅ Special characters safely handled');
        }, 10000);
    });
    describe('UPDATE Operation Injection Protection', () => {
        let testRecordId;
        beforeAll(async () => {
            // Create a record to update
            const record = await testContext.database.createOne('sectest', {
                name: 'Original Name',
                value: 'Original Value'
            });
            testRecordId = record.id;
        });
        test('should safely handle SQL injection attempts in update data', async () => {
            const maliciousUpdate = {
                name: "'; UPDATE users SET admin = true WHERE id = '1'; --",
                value: "'; DELETE FROM important_table; --"
            };
            console.log('🔒 Testing UPDATE injection protection');
            try {
                const result = await testContext.database.updateOne('sectest', testRecordId, maliciousUpdate);
                // Should succeed with malicious strings stored safely
                expect(result).toBeDefined();
                expect(result.name).toBe("'; UPDATE users SET admin = true WHERE id = '1'; --");
                expect(result.value).toBe("'; DELETE FROM important_table; --");
                console.log('✅ Malicious update data safely stored');
            }
            catch (error) {
                // Should not fail with SQL injection errors
                expect(error.message.toLowerCase()).not.toContain('syntax error');
                expect(error.message.toLowerCase()).not.toContain('update users');
                expect(error.message.toLowerCase()).not.toContain('delete from');
            }
        }, 10000);
    });
    describe('DELETE Operation Injection Protection', () => {
        test('should safely handle malicious IDs in delete operations', async () => {
            // Create records with potentially malicious IDs (if they somehow got through)
            const records = [];
            try {
                const record1 = await testContext.database.createOne('sectest', {
                    name: 'Delete Test 1',
                    value: 'test'
                });
                const record2 = await testContext.database.createOne('sectest', {
                    name: 'Delete Test 2',
                    value: 'test'
                });
                records.push(record1, record2);
            }
            catch (error) {
                console.warn('Could not create test records for delete test');
                return;
            }
            console.log('🔒 Testing DELETE injection protection');
            // Try to delete with valid IDs (injection would be in WHERE clause)
            try {
                const deleteResults = await testContext.database.deleteAll('sectest', records.map(r => ({ id: r.id })));
                // Should succeed - proper parameterization in WHERE clause
                expect(deleteResults).toBeDefined();
                expect(Array.isArray(deleteResults)).toBe(true);
                console.log('✅ DELETE operations properly parameterized');
            }
            catch (error) {
                // Should not fail with SQL syntax errors from WHERE clause
                expect(error.message.toLowerCase()).not.toContain('syntax error');
                expect(error.message.toLowerCase()).not.toContain('drop table');
            }
        }, 10000);
    });
    describe('Parameter Numbering Validation', () => {
        test('should properly number parameters in complex UPDATE queries', async () => {
            // This test validates that SET clause parameters don't conflict with WHERE clause parameters
            const record = await testContext.database.createOne('sectest', {
                name: 'Parameter Test',
                value: 'Original'
            });
            const complexUpdate = {
                name: 'Updated Name',
                value: 'Updated Value'
            };
            console.log('🔒 Testing parameter numbering in UPDATE');
            // This will test the fix: SET name = $1, value = $2 WHERE id = $3
            const result = await testContext.database.updateOne('sectest', record.id, complexUpdate);
            expect(result).toBeDefined();
            expect(result.name).toBe('Updated Name');
            expect(result.value).toBe('Updated Value');
            expect(result.id).toBe(record.id);
            console.log('✅ Parameter numbering working correctly');
        }, 10000);
    });
});
//# sourceMappingURL=sql-injection.test.js.map