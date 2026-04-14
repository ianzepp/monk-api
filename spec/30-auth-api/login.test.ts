import { describe, it, expect } from 'bun:test';
import { AuthClient } from '../auth-client.js';
import { expectSuccess } from '../test-assertions.js';

/**
 * POST /auth/login - Authenticate User
 */

describe('POST /auth/login - Authenticate User', () => {
    it('should login with valid tenant, username, and password', async () => {
        const tenantName = `test_login_valid_${Date.now()}`;
        const username = 'root_user';
        const password = 'test-password-4';

        const registerClient = new AuthClient();
        const registerResponse = await registerClient.register({
            tenant: tenantName,
            username,
            email: 'root_user@example.com',
            password,
        });
        expectSuccess(registerResponse);

        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: tenantName,
            username,
            password,
        });

        expectSuccess(response);
        expect(response.data!.token).toBeDefined();
        expect(response.data!.user).toBeDefined();
        expect(response.data!.expires_in).toBe(7 * 24 * 60 * 60);
        expect(response.data!.user!.username).toBe(username);
        expect(response.data!.user!.tenant).toBe(tenantName);
    });

    it('should include format preference in response if provided', async () => {
        const tenantName = `test_login_format_${Date.now()}`;
        const username = 'root_user';
        const password = 'test-password-5';

        const registerClient = new AuthClient();
        const registerResponse = await registerClient.register({ tenant: tenantName, username, email: 'root_user@example.com', password });
        expectSuccess(registerResponse);

        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: tenantName,
            username,
            password,
            format: 'toon',
        });

        expectSuccess(response);
        expect(response.data!.user!.format).toBe('toon');
    });

    it('should reject missing tenant field', async () => {
        const authClient = new AuthClient();

        const response = await authClient.login({
            tenant: '',
            username: 'root_user',
            password: 'test-password-6',
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Tenant is required');
        expect(response.error_code).toBe('AUTH_TENANT_MISSING');
    });

    it('should reject missing username field', async () => {
        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: `test_login_missing_user_${Date.now()}`,
            username: '',
            password: 'test-password-7',
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Username is required');
        expect(response.error_code).toBe('AUTH_USERNAME_MISSING');
    });

    it('should reject missing password field', async () => {
        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: `test_login_missing_password_${Date.now()}`,
            username: 'root_user',
            password: '',
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Password is required');
        expect(response.error_code).toBe('AUTH_PASSWORD_MISSING');
    });

    it('should reject nonexistent tenant', async () => {
        const authClient = new AuthClient();

        const response = await authClient.login({
            tenant: `nonexistent_tenant_${Date.now()}`,
            username: 'root_user',
            password: 'test-password-8',
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Authentication failed');
        expect(response.error_code).toBe('AUTH_LOGIN_FAILED');
    });

    it('should reject invalid password for existing tenant', async () => {
        const tenantName = `test_login_invalid_password_${Date.now()}`;
        const username = 'root_user';

        const registerClient = new AuthClient();
        const registerResponse = await registerClient.register({
            tenant: tenantName,
            username,
            email: 'root_user@example.com',
            password: 'good-password',
        });
        expectSuccess(registerResponse);

        const authClient = new AuthClient();
        const response = await authClient.login({
            tenant: tenantName,
            username,
            password: 'wrong-password',
        });

        expect(response.success).toBe(false);
        expect(response.error).toContain('Authentication failed');
        expect(response.error_code).toBe('AUTH_LOGIN_FAILED');
    });
});
