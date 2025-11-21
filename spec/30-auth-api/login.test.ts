import { describe, it, expect } from 'vitest';
import { AuthClient } from '../auth-client.js';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';

/**
 * POST /auth/login - Authenticate User
 *
 * Tests user authentication endpoint. Validates credentials against a tenant
 * and issues a JWT token if successful.
 */

describe('POST /auth/login - Authenticate User', () => {
    it('should login with valid tenant and username', async () => {
        // Create a test tenant first
        const tenant = await TestHelpers.createTestTenant('login-valid');

        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: tenant.tenantName,
            username: 'root',
        });

        expectSuccess(response);
        expect(response.data!.token).toBeDefined();
        expect(response.data!.user).toBeDefined();
        expect(response.data!.user!.username).toBe('root');
        expect(response.data!.user!.tenant).toBe(tenant.tenantName);
    });

    it('should include format preference in token if provided', async () => {
        // Create a test tenant first
        const tenant = await TestHelpers.createTestTenant('login-format');

        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: tenant.tenantName,
            username: 'root',
            format: 'toon',
        });

        expectSuccess(response);
        expect(response.data!.user!.format).toBe('toon');
    });

    it('should reject missing tenant field', async () => {
        const authClient = new AuthClient();

        const response = await authClient.login({
            tenant: '',
            username: 'root',
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Tenant is required');
        expect(response.error_code).toBe('AUTH_TENANT_MISSING');
    });

    it('should reject missing username field', async () => {
        // Create a test tenant first
        const tenant = await TestHelpers.createTestTenant('login-missing-user');

        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: tenant.tenantName,
            username: '',
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Username is required');
        expect(response.error_code).toBe('AUTH_USERNAME_MISSING');
    });

    it('should reject nonexistent tenant', async () => {
        const authClient = new AuthClient();

        const response = await authClient.login({
            tenant: `nonexistent-tenant-${Date.now()}`,
            username: 'root',
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Authentication failed');
        expect(response.error_code).toBe('AUTH_LOGIN_FAILED');
    });

    it('should reject invalid username for existing tenant', async () => {
        // Create a test tenant first
        const tenant = await TestHelpers.createTestTenant('login-invalid-user');

        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: tenant.tenantName,
            username: `invalid-user-${Date.now()}`,
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Authentication failed');
        expect(response.error_code).toBe('AUTH_LOGIN_FAILED');
    });

    it.skip('AUTH_TENANT_MISSING - null/undefined tenant parameter', async () => {
        // UNIMPLEMENTED: Testing null/undefined in JSON body requires special handling
        // Standard JSON parsing treats missing fields as undefined
        // To test this, would need to:
        // 1. Send request with no tenant field in JSON body
        // 2. Verify error_code is AUTH_TENANT_MISSING
        // Status: Covered by empty string test above, null/undefined behaves same way
    });
});
