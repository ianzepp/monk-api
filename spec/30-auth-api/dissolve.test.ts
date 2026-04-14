import { describe, it, expect } from 'bun:test';
import { AuthClient } from '../auth-client.js';
import { HttpClient } from '../http-client.js';
import { TEST_CONFIG } from '../test-config.js';
import { expectSuccess } from '../test-assertions.js';

/**
 * POST /auth/dissolve + POST /auth/dissolve/confirm - Tenant/user dissolution
 */

const BASE_URL = TEST_CONFIG.API_URL;

async function registerTenant(tenant: string, username = 'root_user', password = 'test-password-dissolve') {
    const authClient = new AuthClient();
    const response = await authClient.register({
        tenant,
        username,
        email: `${username}@example.com`,
        password,
    });
    expectSuccess(response);
    return { authClient, token: response.data!.token };
}

// ---------------------------------------------------------------------------
// POST /auth/dissolve
// ---------------------------------------------------------------------------

describe('POST /auth/dissolve - Issue confirmation token', () => {
    it('should return a confirmation token for valid credentials', async () => {
        const tenantName = `test_dissolve_valid_${Date.now()}`;
        const username = 'root_user';
        const password = 'test-password-dissolve';

        await registerTenant(tenantName, username, password);

        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', { tenant: tenantName, username, password });

        expect(response.success).toBe(true);
        expect(response.data.confirmation_token).toBeDefined();
        expect(typeof response.data.confirmation_token).toBe('string');
        expect(response.data.expires_in).toBe(300);
    });

    it('should reject missing tenant', async () => {
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', { username: 'root_user', password: 'pw' });
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('AUTH_TENANT_MISSING');
    });

    it('should reject missing username', async () => {
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', { tenant: 'some_tenant', password: 'pw' });
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('AUTH_USERNAME_MISSING');
    });

    it('should reject missing password', async () => {
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', { tenant: 'some_tenant', username: 'root_user' });
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('AUTH_PASSWORD_MISSING');
    });

    it('should reject non-canonical tenant', async () => {
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', { tenant: 'Bad Tenant', username: 'root_user', password: 'pw' });
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('AUTH_TENANT_INVALID');
    });

    it('should reject non-canonical username', async () => {
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', { tenant: 'good_tenant', username: 'Bad-User', password: 'pw' });
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('AUTH_USERNAME_INVALID');
    });

    it('should reject wrong password', async () => {
        const tenantName = `test_dissolve_wrongpw_${Date.now()}`;
        await registerTenant(tenantName);

        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', { tenant: tenantName, username: 'root_user', password: 'wrong-password' });
        expect(response.success).toBe(false);
    });

    it('should reject unknown tenant', async () => {
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', { tenant: 'no_such_tenant_xyz', username: 'root_user', password: 'pw' });
        expect(response.success).toBe(false);
    });

    it('should reject non-root users', async () => {
        const tenantName = `test_dissolve_nonroot_${Date.now()}`;
        const password = 'test-password-dissolve';

        // Register the tenant and keep the authenticated root client.
        const { authClient } = await registerTenant(tenantName, 'root_user', password);

        // Create a non-root user in the tenant.
        const nonRootCreate = await authClient.client.post('/api/user', {
            name: 'Regular User',
            auth: 'regular_user',
            access: 'read',
        });
        expect(nonRootCreate.success).toBe(true);

        // Attempt dissolve as regular_user.
        // The access-level guard fires BEFORE Auth0 is consulted, so the broker
        // identity for regular_user in this tenant does not need to exist.
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve', {
            tenant: tenantName,
            username: 'regular_user',
            password,
        });
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('AUTH_DISSOLVE_FORBIDDEN');
    });
});

// ---------------------------------------------------------------------------
// POST /auth/dissolve/confirm
// ---------------------------------------------------------------------------

describe('POST /auth/dissolve/confirm - Complete dissolution', () => {
    it('should dissolve tenant and prevent subsequent login', async () => {
        const tenantName = `test_dissolve_confirm_${Date.now()}`;
        const username = 'root_user';
        const password = 'test-password-dissolve';

        await registerTenant(tenantName, username, password);

        // Step 1: get confirmation token
        const client = new HttpClient(BASE_URL);
        const dissolveResponse = await client.post('/auth/dissolve', { tenant: tenantName, username, password });
        expect(dissolveResponse.success).toBe(true);
        const confirmationToken = dissolveResponse.data.confirmation_token;

        // Step 2: confirm dissolution
        const confirmResponse = await client.post('/auth/dissolve/confirm', { confirmation_token: confirmationToken });
        expect(confirmResponse.success).toBe(true);
        expect(confirmResponse.data.tenant).toBe(tenantName);
        expect(confirmResponse.data.username).toBe(username);
        expect(confirmResponse.data.dissolved).toBe(true);

        // Step 3: login should now fail
        const authClient = new AuthClient();
        const loginResponse = await authClient.login({ tenant: tenantName, username, password });
        expect(loginResponse.success).toBe(false);
    });

    it('should reject missing confirmation_token', async () => {
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve/confirm', {});
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('DISSOLVE_TOKEN_MISSING');
    });

    it('should reject an invalid token string', async () => {
        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve/confirm', { confirmation_token: 'not.a.valid.jwt' });
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('DISSOLVE_TOKEN_INVALID');
    });

    it('should reject a normal login token used as confirmation token', async () => {
        const tenantName = `test_dissolve_token_type_${Date.now()}`;
        const { token: loginToken } = await registerTenant(tenantName);

        const client = new HttpClient(BASE_URL);
        const response = await client.post('/auth/dissolve/confirm', { confirmation_token: loginToken });
        expect(response.success).toBe(false);
        expect(response.error_code).toBe('DISSOLVE_TOKEN_INVALID');
    });

    it('should reject confirmation token presented as API bearer token', async () => {
        const tenantName = `test_dissolve_bearer_${Date.now()}`;
        const username = 'root_user';
        const password = 'test-password-dissolve';

        await registerTenant(tenantName, username, password);

        const client = new HttpClient(BASE_URL);
        const dissolveResponse = await client.post('/auth/dissolve', { tenant: tenantName, username, password });
        expect(dissolveResponse.success).toBe(true);
        const confirmationToken = dissolveResponse.data.confirmation_token;

        // Attempt to use the dissolve token as a normal bearer token on an API route
        client.setAuthToken(confirmationToken);
        const apiResponse = await client.get('/api/describe');
        expect(apiResponse.success).toBe(false);
    });
});
