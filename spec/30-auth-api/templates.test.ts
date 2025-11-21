import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { HttpClient } from '../http-client.js';
import { TEST_CONFIG } from '../test-config.js';

/**
 * GET /auth/templates - List available templates
 *
 * Tests template discovery endpoint. Behavior depends on server mode:
 * - Personal mode (TENANT_NAMING_MODE=personal): Returns list of available templates
 * - Enterprise mode (default): Returns 403 error (templates not discoverable in multi-tenant setup)
 */

describe('GET /auth/templates - List Available Templates', () => {
    const isPersonalMode = (process.env.TENANT_NAMING_MODE || '').toLowerCase() === 'personal';

    if (isPersonalMode) {
        describe('Personal Mode Tests', () => {
            let testTenant: any;

            beforeAll(async () => {
                testTenant = await TestHelpers.createTestTenant('templates-api-test');
            });

            it('should return list of templates with structure', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/templates');

                expect(response.success).toBe(true);
                expect(Array.isArray(response.data)).toBe(true);
                expect(response.data.length).toBeGreaterThan(0);

                // Verify template structure
                const firstTemplate = response.data[0];
                expect(firstTemplate).toHaveProperty('name');
                expect(firstTemplate).toHaveProperty('description');
            });

            it('should include system template', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/templates');

                expect(response.success).toBe(true);
                const templateNames = response.data.map((t: any) => t.name);
                expect(templateNames).toContain('system');
            });

            it('should include demo template', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/templates');

                expect(response.success).toBe(true);
                const templateNames = response.data.map((t: any) => t.name);
                expect(templateNames).toContain('demo');
            });

            it('should return templates sorted with system first', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/templates');

                expect(response.success).toBe(true);
                // System template should be first (sorted by is_system DESC, name ASC)
                expect(response.data[0].name).toBe('system');
            });

            it('should allow unauthenticated access to templates', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);

                const response = await client.get('/auth/templates');

                expect(response.success).toBe(true);
                expect(Array.isArray(response.data)).toBe(true);
            });

            it('should include descriptions for templates', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(testTenant.token);

                const response = await client.get('/auth/templates');

                expect(response.success).toBe(true);
                const template = response.data.find((t: any) => t.name === 'system');
                expect(template).toBeDefined();
                // Description may be null or a string
                expect(['string', 'object']).toContain(typeof template.description);
            });
        });
    } else {
        describe('Enterprise Mode Tests', () => {
            it('should reject template listing with AUTH_TEMPLATE_LIST_NOT_AVAILABLE', async () => {
                const tenant = await TestHelpers.createTestTenant('templates-enterprise');
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(tenant.token);

                const response = await client.get('/auth/templates');

                expect(response.success).toBe(false);
                expect(response.error).toContain('only available in personal mode');
                expect(response.error_code).toBe('AUTH_TEMPLATE_LIST_NOT_AVAILABLE');
            });

            it('should return 403 status for template listing', async () => {
                const tenant = await TestHelpers.createTestTenant('templates-enterprise-403');
                const client = new HttpClient(TEST_CONFIG.API_URL);
                client.setAuthToken(tenant.token);

                const response = await client.get('/auth/templates');

                expect(response.statusCode).toBe(403);
            });

            it('should reject even without authentication', async () => {
                const client = new HttpClient(TEST_CONFIG.API_URL);

                const response = await client.get('/auth/templates');

                expect(response.success).toBe(false);
                expect(response.error_code).toBe('AUTH_TEMPLATE_LIST_NOT_AVAILABLE');
            });
        });
    }
});
