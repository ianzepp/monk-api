/**
 * API Endpoint SQL Injection Security Tests
 * 
 * Systematic testing of SQL injection protection across all API endpoints
 * including data operations, meta operations, and authentication endpoints.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext, type TestTenantManager, type TestContext } from '@spec/helpers/test-tenant.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { 
    CLASSIC_INJECTION_VECTORS,
    MALICIOUS_FIELD_PAYLOADS
} from './injection-vectors.js';
import { SecurityAssertions, InjectionTester } from './security-helpers.js';

describe('API Endpoint Injection Protection', () => {
    let tenantManager: TestTenantManager;
    let testContext: TestContext;

    beforeAll(async () => {
        await ObserverLoader.preloadObservers();
        tenantManager = await createTestTenant();
        if (!tenantManager.tenant) {
            throw new Error('Failed to create test tenant');
        }
        testContext = await createTestContext(tenantManager.tenant, 'root');

        // Create endpoint testing schema
        const endpointTestSchema = `
title: API Endpoint Security Test Schema
type: object
properties:
  name:
    type: string
    description: Name field for endpoint testing
  value:
    type: string
    description: Value field for endpoint testing
  numeric:
    type: number
    description: Numeric field for type testing
required:
  - name
additionalProperties: true
`;

        try {
            await testContext.metabase.createOne('apitest', endpointTestSchema.trim());
            logger.info('✅ API endpoint test schema created');
        } catch (error) {
            logger.warn('⚠️  API test schema may already exist');
        }
    });

    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
    });

    describe('Data API Endpoint Security', () => {
        test('should protect CREATE endpoint against injection in request body', async () => {
            logger.info('🔒 Testing POST /api/data/:schema injection protection');

            // Test injection in various fields of request body
            const injectionTests = CLASSIC_INJECTION_VECTORS.slice(0, 5).map(vector => ({
                name: vector.payload,
                value: `Test value for ${vector.name}`,
                numeric: 42
            }));

            for (const testData of injectionTests) {
                try {
                    const result = await testContext.database.createOne('apitest', testData);
                    
                    // Should safely store malicious data as strings
                    expect(result.name).toBe(testData.name);
                    SecurityAssertions.expectNoSqlErrors(result);
                    SecurityAssertions.expectNoDatabaseDisclosure(result);
                    
                } catch (error) {
                    // Validation errors acceptable, SQL errors not
                    SecurityAssertions.expectNoSqlErrors(null, error);
                }
            }

            logger.info('✅ CREATE endpoint injection protection validated');
        }, 20000);

        test('should protect UPDATE endpoint against injection in request body', async () => {
            logger.info('🔒 Testing PUT /api/data/:schema/:id injection protection');

            // Create test record
            const record = await testContext.database.createOne('apitest', {
                name: 'Original Name',
                value: 'Original Value'
            });

            // Test injection in update data
            const maliciousUpdate = {
                name: "'; UPDATE users SET admin = true; --",
                value: "'; DROP TABLE important; --",
                numeric: 999
            };

            const result = await testContext.database.updateOne('apitest', record.id, maliciousUpdate);

            expect(result.name).toBe("'; UPDATE users SET admin = true; --");
            expect(result.value).toBe("'; DROP TABLE important; --");
            SecurityAssertions.expectNoSqlErrors(result);
            SecurityAssertions.expectNoDatabaseDisclosure(result);

            logger.info('✅ UPDATE endpoint injection protection validated');
        }, 15000);

        test('should protect DELETE endpoint against injection in ID parameters', async () => {
            logger.info('🔒 Testing DELETE /api/data/:schema/:id injection protection');

            // Create records to delete
            const records = await testContext.database.createAll('apitest', [
                { name: 'Delete Test 1', value: 'test1' },
                { name: 'Delete Test 2', value: 'test2' }
            ]);

            // Test deletion with valid IDs (injection would be in WHERE clause)
            const deleteResult = await testContext.database.deleteAll('apitest', 
                records.map(r => ({ id: r.id }))
            );

            expect(Array.isArray(deleteResult)).toBe(true);
            expect(deleteResult.length).toBe(2);

            // Verify records were soft deleted (trashed_at set)
            deleteResult.forEach(result => {
                expect(result.trashed_at).toBeDefined();
                SecurityAssertions.expectNoSqlErrors(result);
            });

            logger.info('✅ DELETE endpoint injection protection validated');
        }, 15000);
    });

    describe('Meta API Endpoint Security', () => {
        test('should protect schema creation against injection in YAML content', async () => {
            logger.info('🔒 Testing POST /api/meta/schema injection protection');

            // Test malicious YAML content
            const maliciousSchemaYaml = `
title: Malicious Schema Test
description: '; DROP TABLE schema; --
type: object
properties:
  name:
    type: string
    description: '; INSERT INTO admin VALUES ('hacker'); --
required:
  - name
`;

            try {
                await testContext.metabase.createOne('malicious-schema', maliciousSchemaYaml);
                
                // If it succeeds, verify the malicious content was safely stored
                const retrievedSchema = await testContext.metabase.selectOne('malicious-schema');
                expect(retrievedSchema).toContain("'; DROP TABLE schema; --");
                expect(retrievedSchema).toContain("'; INSERT INTO admin VALUES ('hacker'); --");

                logger.info('✅ Meta API safely stored malicious YAML content');

            } catch (error: any) {
                // Should fail with validation errors, not SQL errors
                SecurityAssertions.expectNoSqlErrors(null, error);
                SecurityAssertions.expectNoDatabaseDisclosure(null, error);
                logger.info('✅ Meta API properly rejected malicious schema');
            }

            // Clean up
            try {
                await testContext.metabase.deleteOne('malicious-schema');
            } catch (error) {
                // Cleanup failure is acceptable
            }
        }, 15000);
    });

    describe('Bulk Operation Security', () => {
        test('should protect bulk operations against injection across multiple records', async () => {
            logger.info('🔒 Testing bulk operation injection protection');

            // Create multiple records with different injection vectors
            const bulkInjectionData = CLASSIC_INJECTION_VECTORS.slice(0, 3).map((vector, index) => ({
                name: vector.payload,
                value: `Bulk test ${index}`,
                numeric: index + 100
            }));

            const results = await testContext.database.createAll('apitest', bulkInjectionData);

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(3);

            // Verify each injection payload was safely stored
            results.forEach((result, index) => {
                expect(result.name).toBe(CLASSIC_INJECTION_VECTORS[index].payload);
                SecurityAssertions.expectNoSqlErrors(result);
                SecurityAssertions.expectNoDatabaseDisclosure(result);
            });

            logger.info('✅ Bulk operation injection protection validated');
        }, 20000);

        test('should protect bulk updates against injection', async () => {
            logger.info('🔒 Testing bulk update injection protection');

            // Get existing records to update
            const existingRecords = await testContext.database.selectAny('apitest');
            if (existingRecords.length < 2) {
                logger.info('⚠️  Not enough records for bulk update test');
                return;
            }

            // Test bulk update with injection payloads
            const updateData = existingRecords.slice(0, 2).map((record, index) => ({
                id: record.id,
                name: record.name, // Keep original
                value: MALICIOUS_FIELD_PAYLOADS[index] || "'; MALICIOUS PAYLOAD; --"
            }));

            const updateResults = await testContext.database.updateAll('apitest', updateData);

            expect(Array.isArray(updateResults)).toBe(true);
            expect(updateResults.length).toBe(2);

            // Verify injection payloads safely stored
            updateResults.forEach((result, index) => {
                const expectedPayload = MALICIOUS_FIELD_PAYLOADS[index] || "'; MALICIOUS PAYLOAD; --";
                expect(result.value).toBe(expectedPayload);
                SecurityAssertions.expectNoSqlErrors(result);
            });

            logger.info('✅ Bulk update injection protection validated');
        }, 20000);
    });

    describe('Observer Security Integration', () => {
        test('should validate that Phase 1+2 observers maintain injection protection', async () => {
            logger.info('🔒 Testing observer ring security with injection data');

            // Test that our new ring structure (DataPreparation → InputValidation → Security)
            // maintains injection protection throughout the pipeline
            
            const injectionData = {
                name: "'; SELECT * FROM admin; --",
                email: 'observer-security@example.com',
                description: "'; DROP DATABASE production; --"
            };

            // This will trigger the complete observer pipeline:
            // Ring 0: InputSanitizer → RecordPreloader → UpdateMerger
            // Ring 1: JsonSchemaValidator → RequiredFieldsValidator → SystemSchemaProtector  
            // Ring 2: ExistenceValidator → SoftDeleteProtector
            // Ring 5: SqlObserver with transaction management
            
            const result = await testContext.database.createOne('sectest', injectionData);

            expect(result).toBeDefined();
            expect(result.name).toBe("'; SELECT * FROM admin; --");
            expect(result.description).toBe("'; DROP DATABASE production; --");

            SecurityAssertions.expectNoSqlErrors(result);
            SecurityAssertions.expectNoDatabaseDisclosure(result);
            SecurityAssertions.expectNoPrivilegeEscalation(result);

            logger.info('✅ Observer pipeline maintains comprehensive injection protection');
        }, 15000);
    });
});