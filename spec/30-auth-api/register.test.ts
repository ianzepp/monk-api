import { describe, it, expect } from 'bun:test';
import { AuthClient } from '../auth-client.js';
import { expectSuccess } from '../test-assertions.js';

/**
 * POST /auth/register - Register New Tenant
 */

describe('POST /auth/register - Register New Tenant', () => {
    it('should register with tenant, username, and password', async () => {
        const authClient = new AuthClient();

        const response = await authClient.register({
            tenant: `test_register_a_${Date.now()}`,
            username: 'root_user',
            password: 'test-password-1',
        });

        expectSuccess(response);
        expect(response.data!.tenant).toBeDefined();
        expect(response.data!.token).toBeDefined();
        expect(response.data!.username).toBe('root_user');
        expect(response.data!.expires_in).toBeDefined();
    });

    it('should reject duplicate tenant name', async () => {
        const authClient = new AuthClient();
        const tenantName = `test_register_duplicate_${Date.now()}`;

        const firstResponse = await authClient.register({
            tenant: tenantName,
            username: 'root_user',
            password: 'test-password-2',
        });
        expectSuccess(firstResponse);

        const secondResponse = await authClient.register({
            tenant: tenantName,
            username: 'root_user',
            password: 'test-password-2',
        });

        expect(secondResponse.success).toBe(false);
        expect(secondResponse.error).toContain('already exists');
        expect(secondResponse.error_code).toBe('DATABASE_TENANT_EXISTS');
    });

    it('should reject non-canonical tenant and username', async () => {
        const authClient = new AuthClient();

        const response = await authClient.register({
            tenant: 'Not Canonical',
            username: 'Bad-User',
            password: 'test-password-3',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('AUTH_TENANT_INVALID');
    });
});
