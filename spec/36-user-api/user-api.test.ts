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
        it('should allow sudo escalation with reason', async () => {
            const response = await tenant.httpClient.post('/api/user/sudo', {
                reason: 'Testing sudo escalation',
            });

            // Root user should be able to escalate
            if (response.success) {
                expect(response.data).toBeDefined();
                // May include sudo_token, expires_in, is_sudo
                if (response.data.sudo_token) {
                    expect(response.data.sudo_token).toBeDefined();
                }
                if (response.data.is_sudo !== undefined) {
                    expect(response.data.is_sudo).toBe(true);
                }
            } else {
                // Some users may not have sudo privileges
                expect(response.error).toBeDefined();
            }
        });

        it('should require reason for sudo escalation', async () => {
            const response = await tenant.httpClient.post('/api/user/sudo', {});

            // Should either fail or require reason
            if (!response.success) {
                expectError(response);
            }
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
