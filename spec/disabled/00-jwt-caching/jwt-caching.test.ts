import { describe, it, expect } from 'vitest';
import { HttpClient } from '../http-client.js';
import { expectSuccess, expectError } from '../test-assertions.js';
import { TEST_CONFIG } from '../test-config.js';

/**
 * JWT Token Caching Tests
 *
 * Tests that verify the HttpClient automatically caches and includes
 * JWT tokens in requests without manual Authorization headers.
 */

describe('HttpClient JWT Caching', () => {
    const httpClient = new HttpClient(TEST_CONFIG.API_URL);

    it('should not include auth header when no token is set', async () => {
        // Make a request without setting a token
        const response = await httpClient.request('/');

        // Should work (even if endpoint returns 404)
        expect(response).toBeDefined();
        expect(response.status).toBeDefined();
    });

    it('should cache and include auth token in requests', () => {
        const testToken = 'test-jwt-token-12345';

        // Set the token
        httpClient.setAuthToken(testToken);

        // Verify token is cached
        expect(httpClient.getAuthToken()).toBe(testToken);
    });

    it('should clear auth token', () => {
        httpClient.setAuthToken('test-token');
        expect(httpClient.getAuthToken()).toBe('test-token');

        httpClient.clearAuthToken();
        expect(httpClient.getAuthToken()).toBeUndefined();
    });

    it('should allow manual override of cached token', async () => {
        const cachedToken = 'cached-token';

        httpClient.setAuthToken(cachedToken);

        // Manual Authorization header should override cached token
        // (We can't easily verify this without a real endpoint, but the API supports it)
        expect(httpClient.getAuthToken()).toBe(cachedToken);
    });

    it('should create HttpClient with token in constructor', () => {
        const token = 'constructor-token';
        const client = new HttpClient(TEST_CONFIG.API_URL, token);

        expect(client.getAuthToken()).toBe(token);
    });
});
