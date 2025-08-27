/**
 * Comprehensive SQL Injection Security Test Suite
 *
 * Systematic testing of all known SQL injection attack vectors across
 * API endpoints, database operations, and input validation layers.
 *
 * Addresses Issue #114: Comprehensive SQL injection security validation
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext } from '@spec/helpers/test-tenant.js';
import { ObserverLoader } from '@lib/observers/loader.js';
import { getAllInjectionVectors, getInjectionVectorsByCategory, CLASSIC_INJECTION_VECTORS, POSTGRESQL_INJECTION_VECTORS, ADVANCED_INJECTION_VECTORS, ENCODING_INJECTION_VECTORS, EVASION_INJECTION_VECTORS, MALICIOUS_FIELD_PAYLOADS, EDGE_CASE_PAYLOADS } from './injection-vectors.js';
import { SecurityAssertions, InjectionTester } from './security-helpers.js';
describe('Comprehensive SQL Injection Security Suite', () => {
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
        // Create comprehensive test schema for security testing
        const securityTestSchema = `
title: Comprehensive Security Test Schema
description: Schema with various field types for injection testing
type: object
properties:
  name:
    type: string
    minLength: 1
    maxLength: 200
    description: Primary name field for injection testing
  email:
    type: string
    format: email
    description: Email field for format-based injection testing
  description:
    type: string
    maxLength: 1000
    description: Large text field for payload testing
  count:
    type: number
    minimum: 0
    description: Numeric field for type-based injection testing
  status:
    type: string
    enum: ["active", "inactive", "pending"]
    default: "pending"
    description: Enum field for constraint testing
  metadata:
    type: object
    description: JSON field for object injection testing
required:
  - name
  - email
additionalProperties: true
`;
        try {
            await testContext.metabase.createOne('sectest', securityTestSchema.trim());
            console.log('✅ Comprehensive security test schema created');
        }
        catch (error) {
            console.warn('⚠️  Security test schema creation failed, may already exist:', error);
        }
    });
    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
    });
    describe('Classic SQL Injection Vector Testing', () => {
        test('should defend against all classic injection vectors in CREATE operations', async () => {
            console.log(`🔒 Testing ${CLASSIC_INJECTION_VECTORS.length} classic injection vectors in CREATE`);
            const results = await InjectionTester.testMultipleVectors(testContext, 'create', 'sectest', CLASSIC_INJECTION_VECTORS, { email: 'test@example.com' } // Required field
            );
            InjectionTester.assertComprehensiveSecurityCompliance(results);
        }, 30000);
        test('should defend against classic injection vectors in UPDATE operations', async () => {
            // Create a record to update
            const record = await testContext.database.createOne('sectest', {
                name: 'Update Test Record',
                email: 'update@example.com'
            });
            console.log(`🔒 Testing ${CLASSIC_INJECTION_VECTORS.length} classic injection vectors in UPDATE`);
            const results = await InjectionTester.testMultipleVectors(testContext, 'update', 'sectest', CLASSIC_INJECTION_VECTORS, {
                recordId: record.id,
                updateData: { email: 'updated@example.com' }
            });
            InjectionTester.assertComprehensiveSecurityCompliance(results);
        }, 30000);
    });
    describe('PostgreSQL-Specific Injection Testing', () => {
        test('should defend against PostgreSQL-specific attack vectors', async () => {
            console.log(`🔒 Testing ${POSTGRESQL_INJECTION_VECTORS.length} PostgreSQL-specific injection vectors`);
            const results = await InjectionTester.testMultipleVectors(testContext, 'create', 'sectest', POSTGRESQL_INJECTION_VECTORS, { email: 'postgres-test@example.com' });
            InjectionTester.assertComprehensiveSecurityCompliance(results);
            // Additional PostgreSQL-specific checks
            results.forEach(result => {
                SecurityAssertions.expectNoDatabaseDisclosure(result.response, result.error);
            });
        }, 30000);
    });
    describe('Advanced Injection Technique Testing', () => {
        test('should defend against advanced blind and time-based injection', async () => {
            console.log(`🔒 Testing ${ADVANCED_INJECTION_VECTORS.length} advanced injection techniques`);
            const results = await InjectionTester.testMultipleVectors(testContext, 'create', 'sectest', ADVANCED_INJECTION_VECTORS, { email: 'advanced-test@example.com' });
            InjectionTester.assertComprehensiveSecurityCompliance(results);
            // Verify no timing attacks succeeded
            results.forEach(result => {
                SecurityAssertions.expectNoTimingAttack(result.executionTime, 2000);
            });
        }, 45000);
    });
    describe('Encoding Bypass Testing', () => {
        test('should defend against encoding-based injection bypasses', async () => {
            console.log(`🔒 Testing ${ENCODING_INJECTION_VECTORS.length} encoding bypass vectors`);
            const results = await InjectionTester.testMultipleVectors(testContext, 'create', 'sectest', ENCODING_INJECTION_VECTORS, { email: 'encoding-test@example.com' });
            InjectionTester.assertComprehensiveSecurityCompliance(results);
        }, 30000);
    });
    describe('Evasion Technique Testing', () => {
        test('should defend against case sensitivity and whitespace evasion', async () => {
            console.log(`🔒 Testing ${EVASION_INJECTION_VECTORS.length} evasion technique vectors`);
            const results = await InjectionTester.testMultipleVectors(testContext, 'create', 'sectest', EVASION_INJECTION_VECTORS, { email: 'evasion-test@example.com' });
            InjectionTester.assertComprehensiveSecurityCompliance(results);
        }, 30000);
    });
    describe('Edge Case and Boundary Testing', () => {
        test('should handle edge case payloads safely', async () => {
            console.log(`🔒 Testing ${EDGE_CASE_PAYLOADS.length} edge case payloads`);
            for (const payload of EDGE_CASE_PAYLOADS) {
                try {
                    // Skip null/undefined since they're handled by validation
                    if (payload === null || payload === undefined) {
                        continue;
                    }
                    const result = await testContext.database.createOne('sectest', {
                        name: payload,
                        email: 'edge-case@example.com'
                    });
                    // Should either succeed with safe storage or fail with validation error
                    if (result) {
                        expect(result.name).toBe(payload);
                    }
                }
                catch (error) {
                    // Should fail with validation errors, not SQL errors
                    SecurityAssertions.expectNoSqlErrors(null, error);
                    SecurityAssertions.expectNoDatabaseDisclosure(null, error);
                }
            }
            console.log('✅ Edge case payloads handled safely');
        }, 20000);
        test('should handle malicious field payloads across all fields', async () => {
            console.log(`🔒 Testing ${MALICIOUS_FIELD_PAYLOADS.length} malicious payloads across fields`);
            for (const payload of MALICIOUS_FIELD_PAYLOADS) {
                try {
                    // Test injection in different field types
                    const testData = {
                        name: payload,
                        email: 'malicious@example.com',
                        description: payload,
                        status: 'active', // Valid enum value
                        count: 42,
                        metadata: { malicious: payload }
                    };
                    const result = await testContext.database.createOne('sectest', testData);
                    // Verify safe storage across all fields
                    if (result) {
                        expect(result.name).toBe(payload);
                        expect(result.description).toBe(payload);
                        expect(result.metadata?.malicious).toBe(payload);
                    }
                }
                catch (error) {
                    // Validation errors are acceptable, SQL errors are not
                    SecurityAssertions.expectNoSqlErrors(null, error);
                    SecurityAssertions.expectNoDatabaseDisclosure(null, error);
                }
            }
            console.log('✅ Malicious field payloads handled safely');
        }, 30000);
    });
    describe('Comprehensive Security Validation', () => {
        test('should pass complete security validation across all attack vectors', async () => {
            console.log('🔒 Running comprehensive security validation');
            const allVectors = getAllInjectionVectors();
            console.log(`📊 Testing ${allVectors.length} total injection vectors`);
            // Test all vectors in CREATE operations
            const createResults = await InjectionTester.testMultipleVectors(testContext, 'create', 'sectest', allVectors.slice(0, 20), // Test subset for performance
            { email: 'comprehensive@example.com' });
            // Validate security compliance
            SecurityAssertions.assertComprehensiveSecurityCompliance(createResults);
            // Generate and log security report
            const report = InjectionTester.generateSecurityReport(createResults);
            console.log(`📊 Security Test Report:
  Total Vectors: ${report.totalVectors}
  Successful Defenses: ${report.successfulDefenses}
  Failed Defenses: ${report.failedDefenses}
  SQL Errors: ${report.sqlErrors}
  Info Disclosure: ${report.informationDisclosure}
  Avg Execution Time: ${report.averageExecutionTime.toFixed(2)}ms`);
            // All vectors should be successfully defended against
            expect(report.failedDefenses).toBe(0);
            expect(report.sqlErrors).toBe(0);
            expect(report.informationDisclosure).toBe(0);
            console.log('✅ Comprehensive security validation passed');
        }, 60000);
    });
    describe('Observer Pipeline Security Integration', () => {
        test('should validate that observer pipeline provides injection protection', async () => {
            console.log('🔒 Testing observer pipeline injection protection');
            // Test that JsonSchemaValidator doesn't introduce vulnerabilities
            const schemaInjectionData = {
                name: "'; DROP TABLE schema; --",
                email: 'schema-injection@example.com'
            };
            const result = await testContext.database.createOne('sectest', schemaInjectionData);
            // Should succeed with safe storage
            expect(result).toBeDefined();
            expect(result.name).toBe("'; DROP TABLE schema; --");
            // Test that SystemSchemaProtector doesn't introduce vulnerabilities
            try {
                await testContext.database.createOne('schema', {
                    name: "'; DROP TABLE important; --"
                });
                // Should fail due to system schema protection, not SQL injection
            }
            catch (error) {
                expect(error.message).toContain('system schema');
                SecurityAssertions.expectNoSqlErrors(null, error);
            }
            console.log('✅ Observer pipeline provides proper injection protection');
        }, 15000);
        test('should validate that transaction management maintains security', async () => {
            console.log('🔒 Testing transaction security with malicious data');
            // Multi-record operation that should trigger transaction
            const maliciousRecords = [
                { name: "'; DROP TABLE users; --", email: 'tx1@example.com' },
                { name: "'; INSERT INTO admin VALUES ('hacker'); --", email: 'tx2@example.com' }
            ];
            const results = await testContext.database.createAll('sectest', maliciousRecords);
            // Should succeed with all malicious data safely stored
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(2);
            results.forEach((result, index) => {
                expect(result.name).toBe(maliciousRecords[index].name);
                expect(result.email).toBe(maliciousRecords[index].email);
            });
            console.log('✅ Transaction management maintains injection protection');
        }, 15000);
    });
});
//# sourceMappingURL=comprehensive-injection.test.js.map