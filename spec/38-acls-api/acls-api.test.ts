import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * ACLs API Tests
 *
 * Tests the Access Control List management endpoints:
 * - GET /api/acls/:model/:id - Get ACLs for a record
 * - POST /api/acls/:model/:id - Append/merge ACLs (additive)
 * - PUT /api/acls/:model/:id - Replace ACLs (complete replacement)
 * - DELETE /api/acls/:model/:id - Clear all ACLs
 *
 * ACL fields:
 * - access_read: Users who can read the record
 * - access_edit: Users who can edit the record
 * - access_full: Users with full access (read, edit, delete)
 * - access_deny: Users explicitly denied access
 */

describe('ACLs API', () => {
    let tenant: TestTenant;
    let testRecordId: string;

    // Test UUIDs for ACL entries
    const uuid1 = '11111111-1111-1111-1111-111111111111';
    const uuid2 = '22222222-2222-2222-2222-222222222222';
    const uuid3 = '33333333-3333-3333-3333-333333333333';
    const uuid4 = '44444444-4444-4444-4444-444444444444';
    const uuid5 = '55555555-5555-5555-5555-555555555555';
    const uuid6 = '66666666-6666-6666-6666-666666666666';

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('acls-api');

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

        // Create a test record
        const createResponse = await tenant.httpClient.post('/api/data/accounts', [
            {
                name: 'ACL Test Account',
                email: 'acl-test@example.com',
            },
        ]);
        expectSuccess(createResponse);
        testRecordId = createResponse.data[0].id;
    });

    describe('Initial State', () => {
        it('should have empty ACL arrays initially', async () => {
            const response = await tenant.httpClient.get(`/api/data/accounts/${testRecordId}?access=true`);

            expectSuccess(response);

            // ACL fields should be empty arrays
            expect(response.data.access_read).toEqual([]);
            expect(response.data.access_edit).toEqual([]);
            expect(response.data.access_full).toEqual([]);
            expect(response.data.access_deny).toEqual([]);
        });
    });

    describe('GET /api/acls/:model/:id - Retrieve ACLs', () => {
        it('should return ACL data for a record', async () => {
            const response = await tenant.httpClient.get(`/api/acls/accounts/${testRecordId}`);

            expectSuccess(response);
            expect(response.data).toBeDefined();
            expect(response.data.record_id).toBe(testRecordId);
            expect(response.data.model).toBe('accounts');
        });

        it('should include access_lists in response', async () => {
            const response = await tenant.httpClient.get(`/api/acls/accounts/${testRecordId}`);

            expectSuccess(response);
            expect(response.data.access_lists).toBeDefined();
            expect(response.data.access_lists.access_read).toBeDefined();
            expect(response.data.access_lists.access_edit).toBeDefined();
            expect(response.data.access_lists.access_full).toBeDefined();
            expect(response.data.access_lists.access_deny).toBeDefined();
        });
    });

    describe('POST /api/acls/:model/:id - Append/Merge ACLs', () => {
        it('should add ACL entries', async () => {
            const response = await tenant.httpClient.post(`/api/acls/accounts/${testRecordId}`, {
                access_read: [uuid1, uuid2],
                access_edit: [uuid3],
            });

            expectSuccess(response);
            expect(response.data.access_lists.access_read).toContain(uuid1);
            expect(response.data.access_lists.access_read).toContain(uuid2);
            expect(response.data.access_lists.access_edit).toContain(uuid3);
        });

        it('should merge new entries with existing (not replace)', async () => {
            // Add more entries
            const response = await tenant.httpClient.post(`/api/acls/accounts/${testRecordId}`, {
                access_read: [uuid4], // New entry
                access_edit: [uuid3], // Duplicate - should not be added twice
            });

            expectSuccess(response);

            // Should have original 2 + new 1 = 3 read entries
            expect(response.data.access_lists.access_read).toContain(uuid1);
            expect(response.data.access_lists.access_read).toContain(uuid2);
            expect(response.data.access_lists.access_read).toContain(uuid4);
            expect(response.data.access_lists.access_read.length).toBe(3);

            // Should not have duplicates in edit
            expect(response.data.access_lists.access_edit).toContain(uuid3);
            expect(response.data.access_lists.access_edit.length).toBe(1);
        });

        it('should preserve existing fields when updating partial data', async () => {
            // Add only access_full, other fields should be preserved
            const response = await tenant.httpClient.post(`/api/acls/accounts/${testRecordId}`, {
                access_full: [uuid5],
            });

            expectSuccess(response);

            // Previous entries should still exist
            expect(response.data.access_lists.access_read.length).toBe(3);
            expect(response.data.access_lists.access_edit.length).toBe(1);

            // New field should be added
            expect(response.data.access_lists.access_full).toContain(uuid5);
        });
    });

    describe('Data API Integration (after POST)', () => {
        it('should show ACLs added via ACLs API in Data API response', async () => {
            const response = await tenant.httpClient.get(`/api/data/accounts/${testRecordId}?access=true`);

            expectSuccess(response);

            // Verify ACLs are visible in Data API
            expect(response.data.access_read).toContain(uuid1);
            expect(response.data.access_read).toContain(uuid2);
            expect(response.data.access_read).toContain(uuid4);
            expect(response.data.access_edit).toContain(uuid3);
            expect(response.data.access_full).toContain(uuid5);
        });
    });

    describe('PUT /api/acls/:model/:id - Replace ACLs', () => {
        it('should completely replace all ACL lists', async () => {
            const response = await tenant.httpClient.put(`/api/acls/accounts/${testRecordId}`, {
                access_read: [uuid6],
                access_edit: [],
                access_full: [],
                access_deny: [uuid1],
            });

            expectSuccess(response);

            // Should have only the new values
            expect(response.data.access_lists.access_read).toEqual([uuid6]);
            expect(response.data.access_lists.access_edit).toEqual([]);
            expect(response.data.access_lists.access_full).toEqual([]);
            expect(response.data.access_lists.access_deny).toEqual([uuid1]);
        });

        it('should remove all previous ACL entries', async () => {
            // Verify original entries are gone
            const response = await tenant.httpClient.get(`/api/acls/accounts/${testRecordId}`);

            expectSuccess(response);

            // Original entries should be gone
            expect(response.data.access_lists.access_read).not.toContain(uuid2);
            expect(response.data.access_lists.access_read).not.toContain(uuid4);
            expect(response.data.access_lists.access_edit).not.toContain(uuid3);
            expect(response.data.access_lists.access_full).not.toContain(uuid5);
        });

        it('should set missing fields to empty arrays', async () => {
            // PUT with only access_read
            const response = await tenant.httpClient.put(`/api/acls/accounts/${testRecordId}`, {
                access_read: [uuid1],
            });

            expectSuccess(response);

            // Only access_read should have data
            expect(response.data.access_lists.access_read).toEqual([uuid1]);
            expect(response.data.access_lists.access_edit).toEqual([]);
            expect(response.data.access_lists.access_full).toEqual([]);
            expect(response.data.access_lists.access_deny).toEqual([]);
        });

        it('should be idempotent', async () => {
            const aclData = {
                access_read: [uuid1],
                access_edit: [uuid2],
            };

            // First PUT
            const response1 = await tenant.httpClient.put(`/api/acls/accounts/${testRecordId}`, aclData);
            expectSuccess(response1);

            // Second PUT with same data
            const response2 = await tenant.httpClient.put(`/api/acls/accounts/${testRecordId}`, aclData);
            expectSuccess(response2);

            // Results should be identical
            expect(response1.data.access_lists).toEqual(response2.data.access_lists);
        });
    });

    describe('DELETE /api/acls/:model/:id - Clear ACLs', () => {
        it('should clear all ACLs', async () => {
            // First add some ACLs
            await tenant.httpClient.post(`/api/acls/accounts/${testRecordId}`, {
                access_read: [uuid1, uuid2],
                access_edit: [uuid3],
                access_full: [uuid4],
                access_deny: [uuid5],
            });

            // Then clear them
            const response = await tenant.httpClient.delete(`/api/acls/accounts/${testRecordId}`);

            expectSuccess(response);

            // All ACLs should be empty
            expect(response.data.access_lists.access_read).toEqual([]);
            expect(response.data.access_lists.access_edit).toEqual([]);
            expect(response.data.access_lists.access_full).toEqual([]);
            expect(response.data.access_lists.access_deny).toEqual([]);
        });

        it('should show cleared ACLs in Data API', async () => {
            const response = await tenant.httpClient.get(`/api/data/accounts/${testRecordId}?access=true`);

            expectSuccess(response);

            // All ACL fields should be empty
            expect(response.data.access_read).toEqual([]);
            expect(response.data.access_edit).toEqual([]);
            expect(response.data.access_full).toEqual([]);
            expect(response.data.access_deny).toEqual([]);
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent record', async () => {
            const fakeId = '550e8400-e29b-41d4-a716-446655440000';
            const response = await tenant.httpClient.get(`/api/acls/accounts/${fakeId}`);

            expectError(response);
        });

        it('should return 404 for non-existent model', async () => {
            const response = await tenant.httpClient.get(`/api/acls/invalid_model/${testRecordId}`);

            expectError(response);
        });
    });

    describe('POST vs PUT Behavior Difference', () => {
        it('POST should merge, PUT should replace', async () => {
            // Clear ACLs first
            await tenant.httpClient.delete(`/api/acls/accounts/${testRecordId}`);

            // POST adds entries
            await tenant.httpClient.post(`/api/acls/accounts/${testRecordId}`, {
                access_read: [uuid1],
            });

            // POST again should merge (additive)
            const postResponse = await tenant.httpClient.post(`/api/acls/accounts/${testRecordId}`, {
                access_read: [uuid2],
            });

            expectSuccess(postResponse);
            expect(postResponse.data.access_lists.access_read).toContain(uuid1);
            expect(postResponse.data.access_lists.access_read).toContain(uuid2);
            expect(postResponse.data.access_lists.access_read.length).toBe(2);

            // PUT should replace completely
            const putResponse = await tenant.httpClient.put(`/api/acls/accounts/${testRecordId}`, {
                access_read: [uuid3],
            });

            expectSuccess(putResponse);
            expect(putResponse.data.access_lists.access_read).toEqual([uuid3]);
            expect(putResponse.data.access_lists.access_read).not.toContain(uuid1);
            expect(putResponse.data.access_lists.access_read).not.toContain(uuid2);
        });
    });
});
