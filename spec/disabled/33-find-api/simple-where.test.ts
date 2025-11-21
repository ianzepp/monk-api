import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * Find API Simple Where Tests
 *
 * Tests basic where conditions with implicit equality matching.
 * Uses the testing template which provides 5 account records.
 */

describe('Find API - Simple Where Conditions', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    let testAccount: any;
    const httpClient = new HttpClient('http://localhost:9001');

    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'simple-where',
            template: 'testing',
        });

        tenantName = result.tenantName;
        databaseName = result.databaseName;

        const loginResponse = await httpClient.post('/auth/login', {
            tenant: tenantName,
            username: 'full',
        });

        expect(loginResponse.success).toBe(true);
        token = loginResponse.data.token;

        // Get test account data
        const allAccounts = await httpClient.post(
            '/api/find/account',
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        );

        testAccount = allAccounts.data[0];
    });

    afterAll(async () => {
        if (tenantName && databaseName) {
            await TestDatabaseHelper.cleanupTestTenant(tenantName, databaseName);
        }
    });

    it('should find record by exact name match', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { where: { name: testAccount.name } },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(1);
        expect(response.data[0].name).toBe(testAccount.name);
    });

    it('should find record by exact email match', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { where: { email: testAccount.email } },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(1);
        expect(response.data[0].email).toBe(testAccount.email);
    });

    it('should return empty array for non-matching condition', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { where: { name: 'NonExistentUser' } },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(0);
    });
});
