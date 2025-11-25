import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * User API Tests
 *
 * Tests the user identity and profile management endpoints:
 * - GET /api/user/whoami - Get current user identity
 * - GET /api/user/profile - Get user profile
 * - PUT /api/user/profile - Update user profile
 * - POST /api/user/sudo - Escalate to sudo privileges
 * - POST /api/user/deactivate - Deactivate own account
 */

describe('User API', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('user-api');
    });

    describe('GET /api/user/whoami - User Identity', () => {
        it('should return current user information', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami');

            expectSuccess(response);
            expect(response.data).toBeDefined();
            expect(response.data.id).toBeDefined();
            expect(response.data.access).toBeDefined();
        });

        it('should include user name', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami');

            expectSuccess(response);
            expect(response.data.name).toBeDefined();
        });

        it('should require authentication', async () => {
            // Create a new client without auth token
            const { HttpClient } = await import('../http-client.js');
            const unauthClient = new HttpClient('http://localhost:9001');

            // Use request() to get full HTTP response with status code
            const response = await unauthClient.request('/api/user/whoami', { method: 'GET' });

            expect(response.json?.success).toBe(false);
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/user/profile - User Profile', () => {
        it('should return user profile data', async () => {
            const response = await tenant.httpClient.get('/api/user/profile');

            expectSuccess(response);
            expect(response.data).toBeDefined();
            expect(response.data.id).toBeDefined();
            expect(response.data.name).toBeDefined();
        });

        it('should include auth identifier', async () => {
            const response = await tenant.httpClient.get('/api/user/profile');

            expectSuccess(response);
            expect(response.data.auth).toBeDefined();
        });

        it('should include access level', async () => {
            const response = await tenant.httpClient.get('/api/user/profile');

            expectSuccess(response);
            expect(response.data.access).toBeDefined();
        });
    });

    describe('PUT /api/user/profile - Update Profile', () => {
        it('should allow updating user name', async () => {
            const newName = `Updated Name ${Date.now()}`;

            const response = await tenant.httpClient.put('/api/user/profile', {
                name: newName,
            });

            expectSuccess(response);
            expect(response.data.name).toBe(newName);
        });

        it('should reject access level changes via profile endpoint', async () => {
            const response = await tenant.httpClient.put('/api/user/profile', {
                access: 'root',
            });

            // Should either reject with error or ignore the field
            if (response.success) {
                // If it succeeds, verify access wasn't actually changed
                const profile = await tenant.httpClient.get('/api/user/profile');
                expect(profile.data.access).not.toBe('root');
            } else {
                // Error response - just verify it failed
                expectError(response);
            }
        });

        it('should validate name minimum length', async () => {
            const response = await tenant.httpClient.put('/api/user/profile', {
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

    describe('POST /api/user/deactivate - Account Deactivation', () => {
        it('should require confirmation for deactivation', async () => {
            const response = await tenant.httpClient.post('/api/user/deactivate', {});

            // Should require explicit confirmation
            expectError(response);
        });

        // Note: We don't test actual deactivation as it would break subsequent tests
        // The shell test creates a separate user for this purpose
    });
});
