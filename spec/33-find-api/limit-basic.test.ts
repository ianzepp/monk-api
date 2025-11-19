import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';

/**
 * Find API Limit Tests
 *
 * Tests limit functionality with POST /api/find/:schema.
 * Uses the testing template which provides 5 account records.
 */

describe('Find API - Limit Functionality', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    const httpClient = new HttpClient('http://localhost:9001');

    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'limit-basic',
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

    it('should limit results to requested number', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { limit: 2 },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expect(response.success).toBe(true);
        expect(response.data).toHaveLength(2);
    });

    it('should return all records when limit exceeds dataset size', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { limit: 10 },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expect(response.success).toBe(true);
        expect(response.data).toHaveLength(5); // Template has 5 accounts
    });

    it('should work with limit=0 to return empty array', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            { limit: 0 },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expect(response.success).toBe(true);
        expect(response.data).toHaveLength(0);
    });
});
