import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';
import { HttpClient } from '../http-client.js';

/**
 * User API Tests
 *
 * Tests the user management endpoints:
 * - GET /api/user/:id - Get user profile (self or sudo)
 * - PUT /api/user/:id - Update user profile (self or sudo)
 * - DELETE /api/user/:id - Delete/deactivate user (self or sudo)
 * - POST /api/user/sudo - Escalate to sudo privileges
 */

describe('User API', () => {
    let tenant: TestTenant;
    let nonRootClient: HttpClient;
    let fullAccessClient: HttpClient;
    let testUserId: string;

    function decodeJwtPayload(token: string) {
        const [, payloadBase64Url] = token.split('.');
        if (!payloadBase64Url) {
            throw new Error('Invalid JWT format');
        }

        const base64 = payloadBase64Url
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(payloadBase64Url.length + ((4 - payloadBase64Url.length % 4) % 4), '=');

        return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
    }

    beforeAll(async () => {
        // Create tenant with root user
        tenant = await TestHelpers.createTestTenant('user-api');

        // Create a non-root user for self-service tests
        const createUserResponse = await tenant.httpClient.post('/api/user', {
            name: 'Test User',
            auth: 'testuser',
            access: 'edit',
        });
        expectSuccess(createUserResponse);
        testUserId = createUserResponse.data.id;

        // Create a full-access user for sudo-token behavior tests
        const createFullUserResponse = await tenant.httpClient.post('/api/user', {
            name: 'Full User',
            auth: 'fulluser',
            access: 'full',
        });
        expectSuccess(createFullUserResponse);

        const fullUserToken = await TestHelpers.loginToTenant(tenant.tenantName, 'fulluser');
        fullAccessClient = new HttpClient('http://localhost:9001');
        fullAccessClient.setAuthToken(fullUserToken);

        // Login as the non-root user
        const loginToken = await TestHelpers.loginToTenant(tenant.tenantName, 'testuser');
        nonRootClient = new HttpClient('http://localhost:9001');
        nonRootClient.setAuthToken(loginToken);
    });

    describe('GET /api/user/me - User Profile', () => {
        it('should return current user information', async () => {
            const response = await tenant.httpClient.get('/api/user/me');

            expectSuccess(response);
            expect(response.data).toBeDefined();
            expect(response.data.id).toBeDefined();
            expect(response.data.access).toBeDefined();
        });

        it('should include user name', async () => {
            const response = await tenant.httpClient.get('/api/user/me');

            expectSuccess(response);
            expect(response.data.name).toBeDefined();
        });

        it('should include auth identifier', async () => {
            const response = await tenant.httpClient.get('/api/user/me');

            expectSuccess(response);
            expect(response.data.auth).toBeDefined();
        });

        it('should require authentication', async () => {
            // Create a new client without auth token
            const { HttpClient } = await import('../http-client.js');
            const unauthClient = new HttpClient('http://localhost:9001');

            // Use request() to get full HTTP response with status code
            const response = await unauthClient.request('/api/user/me', { method: 'GET' });

            expect(response.json?.success).toBe(false);
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/user - List Users', () => {
        it('should list tenant users for sudo callers without order parsing errors', async () => {
            const response = await tenant.httpClient.get('/api/user?limit=1');

            expectSuccess(response);
            expect(Array.isArray(response.data)).toBe(true);
            expect(response.data).toHaveLength(1);
            expect(response.data[0].id).toBeDefined();
            expect(response.data[0].auth).toBeDefined();
        });
    });

    describe('GET /api/user/:id - User Lookup', () => {
        it('should return a not found error for non-UUID identifiers', async () => {
            const response = await tenant.httpClient.get('/api/user/does-not-exist');

            expectError(response);
            expect(response.error_code).toBe('USER_NOT_FOUND');
            expect(response.error).toBe('User not found');
        });
    });

    describe('PUT /api/user/me - Update Profile', () => {
        it('should allow updating user name', async () => {
            const newName = `Updated Name ${Date.now()}`;

            const response = await nonRootClient.put('/api/user/me', {
                name: newName,
            });

            expectSuccess(response);
            expect(response.data.name).toBe(newName);
        });

        it('should reject access level changes for self-service', async () => {
            // Use non-root user to test self-service restrictions
            const response = await nonRootClient.put('/api/user/me', {
                access: 'root',
            });

            // Should reject with error since non-root users can't change access
            expectError(response);
        });

        it('should validate name minimum length', async () => {
            // Use non-root user to test validation (root users bypass validation)
            const response = await nonRootClient.put('/api/user/me', {
                name: 'a', // Too short
            });

            // Should reject short names
            expectError(response);
        });
    });

    describe('POST /api/user/sudo - Privilege Escalation', () => {
        it('should allow full users to mint a usable sudo token', async () => {
            const response = await fullAccessClient.post('/api/user/sudo', {
                reason: 'Testing sudo escalation',
            });

            expectSuccess(response);

            expect(response.data.sudo_token).toBeDefined();
            expect(response.data.is_sudo).toBe(true);

            const payload = decodeJwtPayload(response.data.sudo_token);
            expect(payload.db).toBeTruthy();
            expect(payload.ns).toBeTruthy();

            const sudoClient = new HttpClient('http://localhost:9001');
            sudoClient.setAuthToken(response.data.sudo_token);
            const sudoProtectedResponse = await sudoClient.get(`/api/user/${testUserId}`);

            expectSuccess(sudoProtectedResponse);
            expect(sudoProtectedResponse.data.id).toBe(testUserId);
            expect(sudoProtectedResponse.data.auth).toBe('testuser');
        });

        it('should allow root user to request sudo escalation', async () => {
            const response = await tenant.httpClient.post('/api/user/sudo', {
                reason: 'Testing root sudo escalation',
            });

            expectSuccess(response);
            expect(response.data.sudo_token).toBeDefined();
        });
    });

    describe('POST /api/user/fake - Impersonation', () => {
        it('should reject fake token requests from non-root users', async () => {
            const response = await nonRootClient.post('/api/user/fake', {
                username: 'fulluser',
            });

            expectError(response);
            expect(response.error_code).toBe('AUTH_FAKE_ACCESS_DENIED');
        });

        it('should allow root users to impersonate another user without runtime DB context errors', async () => {
            const response = await tenant.httpClient.post('/api/user/fake', {
                username: 'testuser',
            });

            expectSuccess(response);
            expect(response.data.fake_token).toBeDefined();

            const fakeClient = new HttpClient('http://localhost:9001');
            fakeClient.setAuthToken(response.data.fake_token);

            const fakeTokenPayload = decodeJwtPayload(response.data.fake_token);
            expect(fakeTokenPayload.db).toBeTruthy();
            expect(fakeTokenPayload.ns).toBeTruthy();

            const refreshResponse = await fakeClient.post('/auth/refresh', {
                token: response.data.fake_token,
            });
            expectError(refreshResponse);
            expect(refreshResponse.error_code).toBe('AUTH_FAKE_TOKEN_REFRESH_DENIED');
        });
    });

    describe('DELETE /api/user/me - Account Deactivation', () => {
        it('should require confirmation for deactivation', async () => {
            // Create a disposable user for this test
            const createResponse = await tenant.httpClient.post('/api/user', {
                name: 'Disposable User',
                auth: 'disposable',
                access: 'edit',
            });
            expectSuccess(createResponse);

            // Login as disposable user
            const disposableToken = await TestHelpers.loginToTenant(tenant.tenantName, 'disposable');
            const disposableClient = new HttpClient('http://localhost:9001');
            disposableClient.setAuthToken(disposableToken);

            // Try to delete without confirmation - should fail
            const response = await disposableClient.delete('/api/user/me', {});

            // Should require explicit confirmation
            expectError(response);
        });

        // Note: We don't test actual deactivation as it would break subsequent tests
        // The shell test creates a separate user for this purpose
    });
});
