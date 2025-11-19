import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';

/**
 * Find API Basic Functionality Tests
 *
 * Tests the POST /api/find/:schema endpoint with empty filter
 * to verify basic functionality and record structure.
 */

describe('Find API - Basic Functionality', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    const httpClient = new HttpClient('http://localhost:9001');

    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'basic-find',
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

    it('should return all records with empty filter', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect(Array.isArray(response.data)).toBe(true);

        // Template has 5 accounts
        expect(response.data.length).toBe(5);
    });

    it('should return properly structured records', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expect(response.success).toBe(true);
        const firstRecord = response.data[0];

        expect(firstRecord).toBeDefined();
        expect(firstRecord.id).toBeDefined();
        expect(firstRecord.name).toBeDefined();
        expect(firstRecord.email).toBeDefined();
    });

    it('should include system timestamps in records', async () => {
        const response = await httpClient.post(
            '/api/find/account',
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        );

        expect(response.success).toBe(true);
        const firstRecord = response.data[0];

        expect(firstRecord.created_at).toBeDefined();
        expect(firstRecord.updated_at).toBeDefined();
        expect(new Date(firstRecord.created_at).toISOString()).toBe(firstRecord.created_at);
        expect(new Date(firstRecord.updated_at).toISOString()).toBe(firstRecord.updated_at);
    });
});
