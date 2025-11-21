import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * Find API Where Comparison Operators Tests
 *
 * Tests $gt, $gte, $lt, $lte comparison operators with POST /api/find/:schema.
 * Uses the testing template which provides accounts with varying balance values.
 */

describe('Find API - Where Comparison Operators', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    const httpClient = new HttpClient('http://localhost:9001');
    const MID_BALANCE = 1000;

    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'where-comparison',
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

    describe('$gt operator (greater than)', () => {
        it('should return records with balance > 1000', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { balance: { $gt: MID_BALANCE } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);

            // All returned records should have balance > 1000
            response.data.forEach((record: any) => {
                expect(record.balance).toBeGreaterThan(MID_BALANCE);
            });
        });
    });

    describe('$gte operator (greater than or equal)', () => {
        it('should return records with balance >= 1000', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { balance: { $gte: MID_BALANCE } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);

            // All returned records should have balance >= 1000
            response.data.forEach((record: any) => {
                expect(record.balance).toBeGreaterThanOrEqual(MID_BALANCE);
            });
        });
    });

    describe('$lt operator (less than)', () => {
        it('should return records with balance < 1000', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { balance: { $lt: MID_BALANCE } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);

            // All returned records should have balance < 1000
            response.data.forEach((record: any) => {
                expect(record.balance).toBeLessThan(MID_BALANCE);
            });
        });
    });

    describe('$lte operator (less than or equal)', () => {
        it('should return records with balance <= 1000', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { balance: { $lte: MID_BALANCE } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);

            // All returned records should have balance <= 1000
            response.data.forEach((record: any) => {
                expect(record.balance).toBeLessThanOrEqual(MID_BALANCE);
            });
        });
    });

    describe('Comparison operator combinations', () => {
        it('should combine $gte and $lte for range query', async () => {
            const response = await httpClient.post(
                '/api/find/account',
                { where: { balance: { $gte: 500, $lte: 2000 } } },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            expectSuccess(response);

            // All returned records should have 500 <= balance <= 2000
            response.data.forEach((record: any) => {
                expect(record.balance).toBeGreaterThanOrEqual(500);
                expect(record.balance).toBeLessThanOrEqual(2000);
            });
        });
    });
});
