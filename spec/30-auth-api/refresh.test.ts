import { describe, it, expect, beforeAll } from 'bun:test';
import { HttpClient } from '../http-client.js';
import { TEST_CONFIG } from '../test-config.js';
import { sign } from 'hono/jwt';

function decodeJwtPayload(token: string): Record<string, any> {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error(`Invalid token format: expected 3 dot-separated parts, got ${parts.length}`);
    }

    const payloadPart = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = payloadPart.padEnd(payloadPart.length + ((4 - (payloadPart.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8'));
}

function getTestJwtSecret(): string {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET not set in test environment');
    }
    return process.env.JWT_SECRET;
}

describe('POST /auth/refresh - Refresh JWT Token', () => {
    let token: string;
    let tenantName: string;
    let username: string;

    beforeAll(async () => {
        tenantName = `test_refresh_api_${Date.now()}`;
        username = 'root_user';
        const client = new HttpClient(TEST_CONFIG.API_URL);
        const response = await client.post('/auth/register', {
            tenant: tenantName,
            username,
            email: 'root_user@example.com',
            password: 'refresh-password',
        });

        token = response.data.token;
    });

    describe('Input Validation', () => {
        it('should reject missing authorization header', async () => {
            const client = new HttpClient(TEST_CONFIG.API_URL);
            const response = await client.request('/auth/refresh', { method: 'POST' });

            expect(response.json?.success).toBe(false);
            expect(response.json?.error).toContain('bearer token');
            expect(response.json?.error_code).toBe('AUTH_TOKEN_REQUIRED');
        });
    });

    describe('Token Refresh Operations', () => {
        it('should refresh valid token', async () => {
            const client = new HttpClient(TEST_CONFIG.API_URL, token);
            const response = await client.post('/auth/refresh');

            expect(response.success).toBe(true);
            expect(response.data?.token).toBeDefined();
            expect(response.data?.token).not.toBe(token);
            expect(response.data?.user?.username).toBe(username);
            expect(response.data?.user?.tenant).toBe(tenantName);
        });

        it('should reject invalid token format', async () => {
            const client = new HttpClient(TEST_CONFIG.API_URL, 'not-a-valid-jwt');
            const response = await client.post('/auth/refresh');

            expect(response.success).toBe(false);
            expect(response.error_code).toBe('AUTH_TOKEN_INVALID');
        });

        it('should reject tampered token', async () => {
            const tamperedToken = token.substring(0, token.length - 10) + 'xxxxxxxxxx';
            const client = new HttpClient(TEST_CONFIG.API_URL, tamperedToken);
            const response = await client.post('/auth/refresh');

            expect(response.success).toBe(false);
            expect(response.error_code).toBe('AUTH_TOKEN_INVALID');
        });

        it('should reject expired token', async () => {
            const payload = decodeJwtPayload(token);
            const now = Math.floor(Date.now() / 1000);
            const expiredToken = await sign(
                {
                    ...payload,
                    iat: now - 120,
                    exp: now - 30,
                },
                getTestJwtSecret()
            );

            const client = new HttpClient(TEST_CONFIG.API_URL, expiredToken);
            const response = await client.post('/auth/refresh');

            expect(response.success).toBe(false);
            expect(response.error_code).toBe('AUTH_TOKEN_EXPIRED');
        });
    });

    describe('Response Format', () => {
        it('should return proper response structure on success', async () => {
            const client = new HttpClient(TEST_CONFIG.API_URL, token);
            const response = await client.post('/auth/refresh');

            expect(response.success).toBe(true);
            expect(response.data).toHaveProperty('token');
            expect(response.data).toHaveProperty('expires_in');
            expect(response.data).toHaveProperty('user');
            expect(response.data.user).toHaveProperty('id');
            expect(response.data.user).toHaveProperty('username');
            expect(response.data.user).toHaveProperty('tenant');
            expect(response.data.user).toHaveProperty('access');
        });

        it('should return expires_in in seconds', async () => {
            const client = new HttpClient(TEST_CONFIG.API_URL, token);
            const response = await client.post('/auth/refresh');

            expect(response.success).toBe(true);
            expect(response.data?.expires_in).toBe(7 * 24 * 60 * 60);
        });

        it('should return different token on each refresh', async () => {
            const client = new HttpClient(TEST_CONFIG.API_URL, token);
            const firstRefresh = await client.post('/auth/refresh');
            const firstToken = firstRefresh.data?.token;

            await new Promise((resolve) => setTimeout(resolve, 1000));

            const secondClient = new HttpClient(TEST_CONFIG.API_URL, firstToken);
            const secondRefresh = await secondClient.post('/auth/refresh');

            expect(secondRefresh.success).toBe(true);
            expect(secondRefresh.data?.token).not.toBe(firstToken);
        });
    });
});
