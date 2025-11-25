import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { HttpClient } from '../http-client.js';
import { TEST_CONFIG } from '../test-config.js';

/**
 * GET /auth/tenants - List available tenants
 *
 * Tests tenant discovery endpoint. Behavior depends on server mode:
 * - Personal mode (TENANT_NAMING_MODE=personal): Returns list of tenants with users
 * - Enterprise mode (default): Returns 403 error (not available in multi-tenant setup)
 */

describe('GET /auth/tenants - List Available Tenants', () => {
    const isPersonalMode = (process.env.TENANT_NAMING_MODE || '').toLowerCase() === 'personal';

    if (isPersonalMode) {
        describe('Personal Mode Tests', () => {
            let testTenant: any;

            beforeAll(async () => {
                testTenant = await TestHelpers.createTestTenant('tenants-api-test');
            });

            it('should return list of tenants with structure', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/tenants');

                expect(response.success).toBe(true);
                expect(Array.isArray(response.data)).toBe(true);
                expect(response.data.length).toBeGreaterThan(0);

                // Verify tenant structure
                const firstTenant = response.data[0];
                expect(firstTenant).toHaveProperty('name');
                expect(firstTenant).toHaveProperty('description');
                expect(firstTenant).toHaveProperty('users');
                expect(Array.isArray(firstTenant.users)).toBe(true);
            });

            it('should include test tenant in list', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/tenants');

                expect(response.success).toBe(true);
                const tenantNames = response.data.map((t: any) => t.name);
                expect(tenantNames).toContain(testTenant.tenantName);
            });

            it('should include users from tenant in response', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/tenants');

                expect(response.success).toBe(true);
                const foundTenant = response.data.find((t: any) => t.name === testTenant.tenantName);
                expect(foundTenant).toBeDefined();
                expect(foundTenant.users).toContain(testTenant.username);
            });

            it('should return tenants sorted by name', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/tenants');

                expect(response.success).toBe(true);
                const names = response.data.map((t: any) => t.name);
                const sortedNames = [...names].sort();
                expect(names).toEqual(sortedNames);
            });

            it('should allow unauthenticated access to tenant list', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);

                const response = await client.get('/auth/tenants');

                expect(response.success).toBe(true);
                expect(Array.isArray(response.data)).toBe(true);
            });
        });
    } else {
        describe('Enterprise Mode Tests', () => {
            it('should reject tenant listing with AUTH_TENANT_LIST_NOT_AVAILABLE', async () => {
                const tenant = await TestHelpers.createTestTenant('tenants-enterprise');
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(tenant.token);

                const response = await client.get('/auth/tenants');

                expect(response.success).toBe(false);
                expect(response.error).toContain('only available in personal mode');
                expect(response.error_code).toBe('AUTH_TENANT_LIST_NOT_AVAILABLE');
            });

            it('should return 403 status for tenant listing', async () => {
                const tenant = await TestHelpers.createTestTenant('tenants-enterprise-403');
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(tenant.token);

                const response = await client.get('/auth/tenants');

                expect(response.statusCode).toBe(403);
            });

            it('should reject even without authentication', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);

                const response = await client.get('/auth/tenants');

                expect(response.success).toBe(false);
                expect(response.error_code).toBe('AUTH_TENANT_LIST_NOT_AVAILABLE');
            });

        });
    }
});
