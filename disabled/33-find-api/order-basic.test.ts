import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * Find API Order Tests
 *
 * Tests basic ordering functionality with POST /api/find/:model.
 * Uses the testing template which provides accounts with different names and balances.
 */

describe('Find API - Order Functionality', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    const httpClient = new HttpClient('http://localhost:9001');

    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'order-basic',
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
    });

    afterAll(async () => {
        if (tenantName && databaseName) {
            await TestDatabaseHelper.cleanupTestTenant(tenantName, databaseName);
        }
    });

    it('should order by name ascending', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { order: ['name asc'] },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(5);

        // Verify ascending order
        for (let i = 0; i < response.data.length - 1; i++) {
            expect(response.data[i].name <= response.data[i + 1].name).toBe(true);
        }
    });

    it('should order by name descending', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { order: ['name desc'] },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(5);

        // Verify descending order
        for (let i = 0; i < response.data.length - 1; i++) {
            expect(response.data[i].name >= response.data[i + 1].name).toBe(true);
        }
    });

    it('should order by numeric field (balance)', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { order: ['balance asc'] },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);

        // Verify numeric ascending order
        for (let i = 0; i < response.data.length - 1; i++) {
            expect(response.data[i].balance <= response.data[i + 1].balance).toBe(true);
        }
    });

    it('should handle multiple field ordering', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { order: ['account_type asc', 'name desc'] },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(5);

        // Verify first level ordering by account_type
        for (let i = 0; i < response.data.length - 1; i++) {
            expect(response.data[i].account_type <= response.data[i + 1].account_type).toBe(true);
        }
    });
});
