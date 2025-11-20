import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * Find API Where Equality Operators Tests
 *
 * Tests $eq, $ne, and $neq equality operators with POST /api/find/:schema.
 * Uses the testing template which provides 5 account records.
 */

describe('Find API - Where Equality Operators', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    let testAccount: any;
    let allAccounts: any[];
    const httpClient = new HttpClient('http://localhost:9001');

    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'where-equality',
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

        // Get all accounts for testing
        const response = await httpClient.post(
            '/api/find/account',
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        );

        allAccounts = response.data;
        testAccount = allAccounts[0];
    });

    afterAll(async () => {
        if (tenantName && databaseName) {
            await TestDatabaseHelper.cleanupTestTenant(tenantName, databaseName);
        }
    });

    describe('$eq operator (explicit equality)', () => {
        it('should return matching record with $eq', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { name: { $eq: testAccount.name } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);
            expect(response.data).toHaveLength(1);
            expect(response.data[0].name).toBe(testAccount.name);
        });

        it('should handle $eq with null value', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { credit_limit: { $eq: null } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);

            // All returned records should have null credit_limit
            response.data.forEach((record: any) => {
                expect(record.credit_limit).toBeNull();
            });
        });
    });

    describe('$ne operator (not equal)', () => {
        it('should exclude matching record with $ne', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { name: { $ne: testAccount.name } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);
            expect(response.data).toHaveLength(4); // 5 total - 1 excluded

            // Verify excluded record is not in results
            const found = response.data.find((r: any) => r.name === testAccount.name);
            expect(found).toBeUndefined();
        });

        it('should handle $ne with null value', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { credit_limit: { $ne: null } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);

            // All returned records should have non-null credit_limit
            response.data.forEach((record: any) => {
                expect(record.credit_limit).not.toBeNull();
            });
        });
    });

    describe('$neq operator (alternative not equal)', () => {
        it('should exclude records matching account_type with $neq', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { account_type: { $neq: testAccount.account_type } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);

            // Calculate expected count
            const expectedCount = allAccounts.filter(
                (a) => a.account_type !== testAccount.account_type
            ).length;

            expect(response.data).toHaveLength(expectedCount);

            // Verify no returned records match the excluded type
            response.data.forEach((record: any) => {
                expect(record.account_type).not.toBe(testAccount.account_type);
            });
        });
    });
});
