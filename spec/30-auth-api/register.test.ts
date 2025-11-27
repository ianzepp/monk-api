import { describe, it, expect } from 'vitest';
import { AuthClient } from '../auth-client.js';
import { expectSuccess } from '../test-assertions.js';

/**
 * POST /auth/register - Register New Tenant
 *
 * Tests tenant registration endpoint.
 */

describe('POST /auth/register - Register New Tenant', () => {
    it('should register with only a new tenant name', async () => {
        const authClient = new AuthClient();

        const response = await authClient.register({
            tenant: `test-register-a-${Date.now()}`,
        });

        expectSuccess(response);
        expect(response.data!.tenant).toBeDefined();
        expect(response.data!.token).toBeDefined();
        expect(response.data!.username).toBeDefined();
        expect(response.data!.expires_in).toBeDefined();
    });

    it('should register with tenant name and custom user name', async () => {
        const authClient = new AuthClient();

        const response = await authClient.register({
            tenant: `test-register-b-${Date.now()}`,
            username: 'admin',
        });

        expectSuccess(response);
        expect(response.data!.tenant).toBeDefined();
        expect(response.data!.username).toBe('admin');
        expect(response.data!.token).toBeDefined();
    });

    it('should reject duplicate tenant name', async () => {
        const authClient = new AuthClient();
        const tenantName = `test-register-duplicate-${Date.now()}`;

        // Register the tenant first time - should succeed
        const firstResponse = await authClient.register({
            tenant: tenantName,
        });

        expectSuccess(firstResponse);

        // Try to register the same tenant again - should fail
        const secondResponse = await authClient.register({
            tenant: tenantName,
        });

        expect(secondResponse.success).toBe(false);
        expect(secondResponse.error).toContain('already exists');
        expect(secondResponse.error_code).toBe('DATABASE_TENANT_EXISTS');
    });

    it.skip('AUTH_DATABASE_NOT_ALLOWED - custom database in enterprise mode', async () => {
        // UNIMPLEMENTED: Requires TENANT_NAMING_MODE=enterprise server
        // Current test server runs in enterprise mode by default
        // To test this error, would need to:
        // 1. Configure test server to run in enterprise mode (likely already does)
        // 2. Attempt registration with custom database parameter
        // 3. Verify error_code is AUTH_DATABASE_NOT_ALLOWED
        // Status: Blocked by server configuration - enterprise mode is default but
        // needs explicit verification that database parameter is rejected
    });

    it.skip('DATABASE_EXISTS - database name collision in personal mode', async () => {
        // UNIMPLEMENTED: Requires TENANT_NAMING_MODE=personal server
        // Current test server runs in enterprise mode (hashed database names)
        // Personal mode uses human-readable database names from tenant names
        // To test this error, would need to:
        // 1. Reconfigure test server to TENANT_NAMING_MODE=personal
        // 2. Register first tenant with name that maps to database "tenant_foo_bar"
        // 3. Register second tenant with different name that also maps to "tenant_foo_bar"
        // 4. Verify error_code is DATABASE_EXISTS
        // Status: Blocked by server mode - would require separate personal mode test server
    });
});
