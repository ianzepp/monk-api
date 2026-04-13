import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';
import { HttpClient } from '../http-client.js';

/**
 * Data API ACL Mutation Tests
 *
 * Verifies record-level ACLs are enforced for write operations.
 */

describe('Data API ACL mutation enforcement', () => {
    let tenant: TestTenant;
    let readonlyClient: HttpClient;
    let deniedClient: HttpClient;
    let fullClient: HttpClient;

    let readRecordId: string;
    let deniedRecordId: string;
    let fullRecordId: string;

    const model = 'acl_documents';

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('data-acl');

        // Create users representing the three permission levels we want to exercise.
        const createReadUserResponse = await tenant.httpClient.post('/api/user', {
            name: 'Read User',
            auth: 'aclread',
            access: 'read',
        });
        expectSuccess(createReadUserResponse);

        const createEditUserResponse = await tenant.httpClient.post('/api/user', {
            name: 'Edit User',
            auth: 'acledit',
            access: 'edit',
        });
        expectSuccess(createEditUserResponse);

        const createFullUserResponse = await tenant.httpClient.post('/api/user', {
            name: 'Full User',
            auth: 'aclfull',
            access: 'full',
        });
        expectSuccess(createFullUserResponse);

        const readToken = await TestHelpers.loginToTenant(tenant.tenantName, 'aclread');
        readonlyClient = new HttpClient('http://localhost:9001');
        readonlyClient.setAuthToken(readToken);

        const editToken = await TestHelpers.loginToTenant(tenant.tenantName, 'acledit');
        deniedClient = new HttpClient('http://localhost:9001');
        deniedClient.setAuthToken(editToken);

        const fullToken = await TestHelpers.loginToTenant(tenant.tenantName, 'aclfull');
        fullClient = new HttpClient('http://localhost:9001');
        fullClient.setAuthToken(fullToken);

        // Create model and fields.
        await tenant.httpClient.post(`/api/describe/${model}`, {});
        await tenant.httpClient.post(`/api/describe/${model}/fields/title`, {
            field_name: 'title',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post(`/api/describe/${model}/fields/body`, {
            field_name: 'body',
            type: 'text',
        });

        // Record that only the read user can read, but cannot mutate.
        const readRecord = await tenant.httpClient.post(`/api/data/${model}`, [{
            title: 'Read-only record',
            body: 'This record should be readable but not writable.',
        }]);
        expectSuccess(readRecord);
        readRecordId = readRecord.data[0].id;
        await tenant.httpClient.post(`/api/acls/${model}/${readRecordId}`, {
            access_read: [createReadUserResponse.data.id],
            access_edit: [],
            access_full: [],
            access_deny: [],
        });

        // Record that denies an edit-capable user.
        const deniedRecord = await tenant.httpClient.post(`/api/data/${model}`, [{
            title: 'Denied record',
            body: 'This record should reject an editor because deny wins.',
        }]);
        expectSuccess(deniedRecord);
        deniedRecordId = deniedRecord.data[0].id;
        await tenant.httpClient.post(`/api/acls/${model}/${deniedRecordId}`, {
            access_read: [],
            access_edit: [createEditUserResponse.data.id],
            access_full: [],
            access_deny: [createEditUserResponse.data.id],
        });

        // Record that grants full access to the full user.
        const fullRecord = await tenant.httpClient.post(`/api/data/${model}`, [{
            title: 'Full-access record',
            body: 'This record should support update/delete/revert/expire.',
        }]);
        expectSuccess(fullRecord);
        fullRecordId = fullRecord.data[0].id;
        await tenant.httpClient.post(`/api/acls/${model}/${fullRecordId}`, {
            access_read: [],
            access_edit: [],
            access_full: [createFullUserResponse.data.id],
            access_deny: [],
        });
    });

    it('should let a read-only user fetch a record but not mutate it', async () => {
        const readResponse = await readonlyClient.get(`/api/data/${model}/${readRecordId}`);
        expectSuccess(readResponse);
        expect(readResponse.data.title).toBe('Read-only record');

        const updateResponse = await readonlyClient.put(`/api/data/${model}/${readRecordId}`, {
            body: 'updated text',
        });
        expectError(updateResponse);
        expect(updateResponse.error_code).toBe('ACCESS_DENIED');

        const deleteResponse = await readonlyClient.delete(`/api/data/${model}/${readRecordId}`);
        expectError(deleteResponse);
        expect(deleteResponse.error_code).toBe('ACCESS_DENIED');
    });

    it('should deny a user when record ACLs explicitly deny them', async () => {
        const updateResponse = await deniedClient.put(`/api/data/${model}/${deniedRecordId}`, {
            body: 'denied update',
        });
        expectError(updateResponse);
        expect(updateResponse.error_code).toBe('ACCESS_DENIED');

        const deleteResponse = await deniedClient.delete(`/api/data/${model}/${deniedRecordId}`);
        expectError(deleteResponse);
        expect(deleteResponse.error_code).toBe('ACCESS_DENIED');
    });

    it('should allow a full-access user to update, delete, revert, and expire a record', async () => {
        const updateResponse = await fullClient.put(`/api/data/${model}/${fullRecordId}`, {
            body: 'updated by full user',
        });
        expectSuccess(updateResponse);
        expect(updateResponse.data.body).toBe('updated by full user');

        const deleteResponse = await fullClient.delete(`/api/data/${model}/${fullRecordId}`);
        expectSuccess(deleteResponse);
        expect(deleteResponse.data.trashed_at).toBeDefined();

        const revertResponse = await fullClient.post(`/api/trashed/${model}/${fullRecordId}`);
        expectSuccess(revertResponse);
        expect(revertResponse.data.trashed_at).toBeNull();

        const deleteAgainResponse = await fullClient.delete(`/api/data/${model}/${fullRecordId}`);
        expectSuccess(deleteAgainResponse);

        const expireResponse = await fullClient.delete(`/api/trashed/${model}/${fullRecordId}`);
        expectSuccess(expireResponse);
        expect(expireResponse.data.deleted_at).toBeDefined();
    });
});
