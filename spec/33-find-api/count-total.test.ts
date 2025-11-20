import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';

/**
 * Find API Total Count Tests
 *
 * Tests count/includeTotal parameter that returns total filtered count
 * for pagination metadata.
 */

describe('Find API - Total Count Parameter', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    const httpClient = new HttpClient('http://localhost:9001');

    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'find-count-total',
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

        // Create additional test records
        const accounts = Array.from({ length: 15 }, (_, i) => ({
            name: `Test Account ${i + 1}`,
            email: `test${i + 1}@example.com`,
            username: `test${i + 1}`,
            account_type: 'personal',
            balance: 0,
            is_active: true,
        }));

        await httpClient.post('/api/data/account', accounts, {
            headers: { Authorization: `Bearer ${token}` },
        });
    });

    afterAll(async () => {
        if (tenantName && databaseName) {
            await TestDatabaseHelper.cleanupTestTenant(tenantName, databaseName);
        }
    });

    it('should include total count with count=true', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            {
                count: true,
                limit: 5,
                where: { is_active: true },
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(5);
        expect(response.total).toBeDefined();
        expect(response.total).toBeGreaterThanOrEqual(19); // 4 template + 15 new
    });

    it('should include total count with includeTotal=true', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            {
                includeTotal: true,
                limit: 3,
                where: { is_active: true },
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(3);
        expect(response.total).toBeDefined();
        expect(response.total).toBeGreaterThanOrEqual(19);
    });

    it('should not include total without count parameter', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            {
                limit: 5,
                where: { is_active: true },
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(5);
        expect(response.total).toBeUndefined();
    });

    it('should return correct total when filtered', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            {
                count: true,
                limit: 2,
                where: { account_type: 'personal' },
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expectSuccess(response);
        expect(response.data).toHaveLength(2);
        expect(response.total).toBeGreaterThan(response.data.length);
    });
});
