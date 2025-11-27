import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * Stat API Tests
 *
 * Tests the GET /api/stat/:model/:id endpoint that returns only
 * system metadata fields without user data.
 *
 * These tests verify:
 * 1. Stat endpoint returns correct metadata fields
 * 2. User data is excluded from responses
 * 3. Error handling (404 for non-existent records)
 * 4. Soft delete detection (trashed_at field)
 * 5. Metadata-only response structure
 */

describe('GET /api/stat/:model/:id - Record Metadata', () => {
    let tenant: TestTenant;
    let testRecordId: string;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('stat-api');

        // Create test model
        await tenant.httpClient.post('/api/describe/accounts', {});
        await tenant.httpClient.post('/api/describe/accounts/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/accounts/fields/email', {
            field_name: 'email',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/accounts/fields/status', {
            field_name: 'status',
            type: 'text',
        });

        // Create a test record
        const createResponse = await tenant.httpClient.post('/api/data/accounts', [
            {
                name: 'Test Account for Stat',
                email: 'stat@example.com',
                status: 'active',
            },
        ]);
        expectSuccess(createResponse);
        testRecordId = createResponse.data[0].id;
    });

    describe('Basic Stat Operations', () => {
        it('should return stat metadata for existing record', async () => {
            const response = await tenant.httpClient.get(`/api/stat/accounts/${testRecordId}`);

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

            // Verify size is 0 (not yet implemented)
            expect(response.data.size).toBe(0);
        });

        it('should NOT include user data fields in stat response', async () => {
            const response = await tenant.httpClient.get(`/api/stat/accounts/${testRecordId}`);

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
            const fakeId = '550e8400-e29b-41d4-a716-446655440000';
            const response = await tenant.httpClient.get(`/api/stat/accounts/${fakeId}`);

            expectError(response);
            expect(response.error).toBeDefined();
        });

        it('should return 404 for non-existent model', async () => {
            const response = await tenant.httpClient.get(`/api/stat/invalid_model/${testRecordId}`);

            expectError(response);
            expect(response.error).toBeDefined();
        });
    });

    describe('Soft Delete Detection', () => {
        it('should return null trashed_at for active records', async () => {
            const response = await tenant.httpClient.get(`/api/stat/accounts/${testRecordId}`);

            expectSuccess(response);
            expect(response.data.trashed_at).toBeNull();
        });

        it('should return trashed_at timestamp for soft-deleted records', async () => {
            // Create a record to delete
            const createResponse = await tenant.httpClient.post('/api/data/accounts', [
                {
                    name: 'Account To Delete',
                    email: 'delete@example.com',
                },
            ]);
            expectSuccess(createResponse);
            const recordId = createResponse.data[0].id;

            // Soft delete the record
            const deleteResponse = await tenant.httpClient.delete(`/api/data/accounts/${recordId}`);
            expectSuccess(deleteResponse);

            // Stat the deleted record (stat should work on trashed records)
            const statResponse = await tenant.httpClient.get(`/api/stat/accounts/${recordId}`);

            expectSuccess(statResponse);
            expect(statResponse.data.id).toBe(recordId);
            expect(statResponse.data.trashed_at).not.toBeNull();
            expect(statResponse.data.trashed_at).toBeDefined();

            // Verify trashed_at is a valid ISO 8601 timestamp
            expect(new Date(statResponse.data.trashed_at).toISOString()).toBe(statResponse.data.trashed_at);
        });
    });

    describe('Timestamp Accuracy', () => {
        it('should reflect record creation time', async () => {
            // Create new record
            const createResponse = await tenant.httpClient.post('/api/data/accounts', [
                {
                    name: 'Timestamp Test Account',
                    email: 'timestamp@example.com',
                },
            ]);

            expectSuccess(createResponse);
            const recordId = createResponse.data[0].id;

            // Get stat
            const statResponse = await tenant.httpClient.get(`/api/stat/accounts/${recordId}`);

            expectSuccess(statResponse);
            const createdAt = new Date(statResponse.data.created_at);

            // Verify created_at is a valid recent timestamp
            // Use 24-hour window to handle timezone differences between test client and server
            const now = Date.now();
            const oneDayAgo = now - 24 * 60 * 60 * 1000;
            const oneDayAhead = now + 24 * 60 * 60 * 1000;
            expect(createdAt.getTime()).toBeGreaterThan(oneDayAgo);
            expect(createdAt.getTime()).toBeLessThan(oneDayAhead);
        });

        it('should update updated_at timestamp on record modification', async () => {
            // Create new record
            const createResponse = await tenant.httpClient.post('/api/data/accounts', [
                {
                    name: 'Update Test Account',
                    email: 'update-test@example.com',
                },
            ]);

            expectSuccess(createResponse);
            const recordId = createResponse.data[0].id;

            // Get initial stat
            const initialStat = await tenant.httpClient.get(`/api/stat/accounts/${recordId}`);
            const initialUpdatedAt = new Date(initialStat.data.updated_at);

            // Wait a bit to ensure timestamp difference
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Update the record
            const updateResponse = await tenant.httpClient.put(`/api/data/accounts/${recordId}`, {
                name: 'Updated Account Name',
            });

            expectSuccess(updateResponse);

            // Get updated stat
            const updatedStat = await tenant.httpClient.get(`/api/stat/accounts/${recordId}`);
            const finalUpdatedAt = new Date(updatedStat.data.updated_at);

            // Verify updated_at changed
            expect(finalUpdatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());

            // Verify created_at didn't change
            expect(updatedStat.data.created_at).toBe(initialStat.data.created_at);
        });
    });

    describe('Response Structure', () => {
        it('should return consistent response structure', async () => {
            const response = await tenant.httpClient.get(`/api/stat/accounts/${testRecordId}`);

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
            const response = await tenant.httpClient.get(`/api/stat/accounts/${testRecordId}`);

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
            const createResponse = await tenant.httpClient.post('/api/data/accounts', [
                {
                    name: 'Cache Test Account',
                    email: 'cache@example.com',
                },
            ]);

            const recordId = createResponse.data[0].id;

            // Get initial stat (simulating cache timestamp storage)
            const initialStat = await tenant.httpClient.get(`/api/stat/accounts/${recordId}`);
            const cachedTimestamp = initialStat.data.updated_at;

            // Simulate some time passing
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Update the record
            await tenant.httpClient.put(`/api/data/accounts/${recordId}`, {
                name: 'Updated Cache Test',
            });

            // Check stat to see if cache is stale
            const currentStat = await tenant.httpClient.get(`/api/stat/accounts/${recordId}`);

            // Verify cache invalidation detection
            expect(currentStat.data.updated_at).not.toBe(cachedTimestamp);
            expect(new Date(currentStat.data.updated_at).getTime()).toBeGreaterThan(
                new Date(cachedTimestamp).getTime()
            );
        });
    });
});
