import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';

/**
 * Find API Basic Functionality Tests
 *
 * Tests the POST /api/find/:schema endpoint with empty filter
 * to verify basic functionality and record structure.
 */

describe('Find API - Basic Functionality', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        // Create test tenant via API (uses /auth/register)
        tenant = await TestHelpers.createTestTenant('basic-find', 'testing');
    });

    afterAll(async () => {
        // Cleanup handled by global teardown
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should return all records with empty filter', async () => {
        // Auth token automatically included - no manual headers needed!
        const response = await tenant.httpClient.post('/api/find/account', {});

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(Array.isArray(response.data)).toBe(true);

        // Template has 5 accounts
        expect(response.data.length).toBe(5);
    });

    it('should return properly structured records', async () => {
        // Auth token automatically included - no manual headers needed!
        const response = await tenant.httpClient.post('/api/find/account', {});

        expectSuccess(response);
        const firstRecord = response.data[0];

        expect(firstRecord).toBeDefined();
        expect(firstRecord.id).toBeDefined();
        expect(firstRecord.name).toBeDefined();
        expect(firstRecord.email).toBeDefined();
    });

    it('should include system timestamps in records', async () => {
        // Auth token automatically included - no manual headers needed!
        const response = await tenant.httpClient.post('/api/find/account', {});

        expectSuccess(response);
        const firstRecord = response.data[0];

        expect(firstRecord.created_at).toBeDefined();
        expect(firstRecord.updated_at).toBeDefined();
        expect(new Date(firstRecord.created_at).toISOString()).toBe(firstRecord.created_at);
        expect(new Date(firstRecord.updated_at).toISOString()).toBe(firstRecord.updated_at);
    });
});
