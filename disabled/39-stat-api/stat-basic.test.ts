import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * Stat API Tests
 *
 * Tests the GET /api/stat/:model/:record endpoint that returns only
 * system metadata fields without user data.
 *
 * These tests verify:
 * 1. Stat endpoint returns correct metadata fields
 * 2. User data is excluded from responses
 * 3. Error handling (404 for non-existent records)
 * 4. Soft delete detection (trashed_at field)
 * 5. Metadata-only response structure
 */

describe('Stat API (GET /api/stat/:model/:record)', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    let testRecordId: string;
    const httpClient = new HttpClient('http://localhost:9001');

    // Create test tenant before all tests
    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'stat-api',
            template: 'testing',
        });

        tenantName = result.tenantName;
        databaseName = result.databaseName;

        // Get auth token
        const loginResponse = await httpClient.post('/auth/login', {
            tenant: tenantName,
            username: 'full',
        });

        expect(loginResponse.success).toBe(true);
        expect(loginResponse.data.token).toBeDefined();
        token = loginResponse.data.token;

        // Create a test record for stat operations
        const createResponse = await httpClient.post(
            '/api/data/accounts',
            {
                name: 'Test Account for Stat',
                email: 'stat@example.com',
                status: 'active',
            },
            {
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        expect(createResponse.success).toBe(true);
        testRecordId = createResponse.data.id;
    });

    // Clean up test tenant after all tests
    afterAll(async () => {
        if (tenantName && databaseName) {
            await TestDatabaseHelper.cleanupTestTenant(tenantName, databaseName);
        }
    });

    describe('Basic Stat Operations', () => {
        it('should return stat metadata for existing record', async () => {
            const response = await httpClient.get(`/api/stat/accounts/${testRecordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            expectSuccess(response);
            expect(response.data).toBeDefined();

            // Verify all stat fields are present
            expect(response.data.id).toBe(testRecordId);
            expect(response.data.created_at).toBeDefined();
            expect(response.data.updated_at).toBeDefined();
            expect(response.data).toHaveProperty('trashed_at');
            expect(response.data.etag).toBeDefined();
            expect(response.data).toHaveProperty('size');

            // Verify timestamps are valid ISO 8601 format
            expect(new Date(response.data.created_at).toISOString()).toBe(response.data.created_at);
            expect(new Date(response.data.updated_at).toISOString()).toBe(response.data.updated_at);

            // Verify etag matches ID (current implementation)
            expect(response.data.etag).toBe(testRecordId);

            // Verify size is 0 (TODO: not yet implemented)
            expect(response.data.size).toBe(0);
        });

        it('should NOT include user data fields in stat response', async () => {
            const response = await httpClient.get(`/api/stat/accounts/${testRecordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            expectSuccess(response);
            expect(response.data).toBeDefined();

            // User data fields should be ABSENT
            expect(response.data.name).toBeUndefined();
            expect(response.data.email).toBeUndefined();
            expect(response.data.status).toBeUndefined();

            // ACL fields should also be ABSENT
            expect(response.data.access_read).toBeUndefined();
            expect(response.data.access_edit).toBeUndefined();
            expect(response.data.access_full).toBeUndefined();
            expect(response.data.access_deny).toBeUndefined();

            // Only stat metadata fields should be present
            const keys = Object.keys(response.data);
            expect(keys).toEqual(
                expect.arrayContaining(['id', 'created_at', 'updated_at', 'trashed_at', 'etag', 'size'])
            );
            expect(keys.length).toBe(6); // Exactly 6 fields, no more
        });

        it('should return 404 for non-existent record', async () => {
            const response = await httpClient.get('/api/stat/accounts/nonexistent-id-12345', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expectError(response);
            expect(response.error).toBeDefined();
            expect(response.error).toContain('not found');
        });

        it('should return 404 for non-existent model', async () => {
            const response = await httpClient.get(`/api/stat/invalid_model/${testRecordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            expectError(response);
            expect(response.error).toBeDefined();
        });
    });

    describe('Soft Delete Detection', () => {
        it('should return null trashed_at for active records', async () => {
            const response = await httpClient.get(`/api/stat/accounts/${testRecordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            expectSuccess(response);
            expect(response.data.trashed_at).toBeNull();
        });

        it('should return trashed_at timestamp for soft-deleted records', async () => {
            // Create a record to delete
            const createResponse = await httpClient.post(
                '/api/data/accounts',
                {
                    name: 'Account To Delete',
                    email: 'delete@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(createResponse.success).toBe(true);
            const recordId = createResponse.data.id;

            // Soft delete the record
            const deleteResponse = await httpClient.delete(`/api/data/accounts/${recordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(deleteResponse.success).toBe(true);

            // Stat the deleted record
            const statResponse = await httpClient.get(`/api/stat/accounts/${recordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(statResponse.success).toBe(true);
            expect(statResponse.data.id).toBe(recordId);
            expect(statResponse.data.trashed_at).not.toBeNull();
            expect(statResponse.data.trashed_at).toBeDefined();

            // Verify trashed_at is a valid ISO 8601 timestamp
            expect(new Date(statResponse.data.trashed_at).toISOString()).toBe(statResponse.data.trashed_at);
        });
    });

    describe('Timestamp Accuracy', () => {
        it('should reflect record creation time', async () => {
            const beforeCreate = new Date();

            // Create new record
            const createResponse = await httpClient.post(
                '/api/data/accounts',
                {
                    name: 'Timestamp Test Account',
                    email: 'timestamp@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            const afterCreate = new Date();
            expect(createResponse.success).toBe(true);
            const recordId = createResponse.data.id;

            // Get stat
            const statResponse = await httpClient.get(`/api/stat/accounts/${recordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(statResponse.success).toBe(true);
            const createdAt = new Date(statResponse.data.created_at);

            // Verify created_at is within the time range of record creation
            expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000); // 1s buffer
            expect(createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime() + 1000); // 1s buffer
        });

        it('should update updated_at timestamp on record modification', async () => {
            // Create new record
            const createResponse = await httpClient.post(
                '/api/data/accounts',
                {
                    name: 'Update Test Account',
                    email: 'update-test@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(createResponse.success).toBe(true);
            const recordId = createResponse.data.id;

            // Get initial stat
            const initialStat = await httpClient.get(`/api/stat/accounts/${recordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const initialUpdatedAt = new Date(initialStat.data.updated_at);

            // Wait a bit to ensure timestamp difference
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Update the record
            const updateResponse = await httpClient.put(
                `/api/data/accounts/${recordId}`,
                {
                    name: 'Updated Account Name',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(updateResponse.success).toBe(true);

            // Get updated stat
            const updatedStat = await httpClient.get(`/api/stat/accounts/${recordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const finalUpdatedAt = new Date(updatedStat.data.updated_at);

            // Verify updated_at changed
            expect(finalUpdatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());

            // Verify created_at didn't change
            expect(updatedStat.data.created_at).toBe(initialStat.data.created_at);
        });
    });

    describe('Authentication and Authorization', () => {
        it('should require authentication', async () => {
            const response = await httpClient.get(`/api/stat/accounts/${testRecordId}`, {
                headers: {}, // No Authorization header
            });

            expectError(response);
            expect(response.error).toBeDefined();
        });

        it('should respect record ACL permissions', async () => {
            // This test would require setting up ACLs that deny access
            // Skipping for now as it requires more complex setup
            // TODO: Add ACL permission test when ACL test infrastructure is ready
        });
    });

    describe('Response Structure', () => {
        it('should return consistent response structure', async () => {
            const response = await httpClient.get(`/api/stat/accounts/${testRecordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            // Verify top-level response structure
            expect(response).toHaveProperty('success');
            expect(response).toHaveProperty('data');
            expectSuccess(response);

            // Verify data object structure
            expect(typeof response.data).toBe('object');
            expect(Array.isArray(response.data)).toBe(false);

            // Verify exact keys in data object
            const expectedKeys = ['id', 'created_at', 'updated_at', 'trashed_at', 'etag', 'size'];
            const actualKeys = Object.keys(response.data).sort();
            expectedKeys.sort();

            expect(actualKeys).toEqual(expectedKeys);
        });

        it('should return metadata with correct data types', async () => {
            const response = await httpClient.get(`/api/stat/accounts/${testRecordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            expectSuccess(response);

            // Verify data types
            expect(typeof response.data.id).toBe('string');
            expect(typeof response.data.created_at).toBe('string');
            expect(typeof response.data.updated_at).toBe('string');
            expect(response.data.trashed_at === null || typeof response.data.trashed_at === 'string').toBe(true);
            expect(typeof response.data.etag).toBe('string');
            expect(typeof response.data.size).toBe('number');
        });
    });

    describe('Use Case: Cache Invalidation', () => {
        it('should enable efficient cache invalidation checks', async () => {
            // Create a record
            const createResponse = await httpClient.post(
                '/api/data/accounts',
                {
                    name: 'Cache Test Account',
                    email: 'cache@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            const recordId = createResponse.data.id;

            // Get initial stat (simulating cache timestamp storage)
            const initialStat = await httpClient.get(`/api/stat/accounts/${recordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const cachedTimestamp = initialStat.data.updated_at;

            // Simulate some time passing
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Update the record
            await httpClient.put(
                `/api/data/accounts/${recordId}`,
                { name: 'Updated Cache Test' },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            // Check stat to see if cache is stale
            const currentStat = await httpClient.get(`/api/stat/accounts/${recordId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            // Verify cache invalidation detection
            expect(currentStat.data.updated_at).not.toBe(cachedTimestamp);
            expect(new Date(currentStat.data.updated_at).getTime()).toBeGreaterThan(
                new Date(cachedTimestamp).getTime()
            );
        });
    });
});
