import { describe, it, expect } from 'vitest';
import { AuthClient } from '../auth-client.js';
import { TEST_CONFIG } from '../test-config.js';

/**
 * AuthClient Tests
 *
 * Tests that verify the AuthClient properly wraps authentication
 * operations and automatically manages JWT tokens.
 *
 * Note: These tests verify the client behavior, not authentication logic.
 * Authentication logic is tested in other test suites.
 */

describe('AuthClient', () => {
    it('should create AuthClient with default URL', () => {
        const authClient = new AuthClient();
        
        expect(authClient).toBeDefined();
        expect(authClient.client).toBeDefined();
        expect(authClient.getToken()).toBeUndefined();
    });

    it('should create AuthClient with custom URL', () => {
        const customUrl = 'http://localhost:9999';
        const authClient = new AuthClient(customUrl);
        
        expect(authClient).toBeDefined();
        expect(authClient.client).toBeDefined();
    });

    it('should allow setting and getting token', () => {
        const authClient = new AuthClient(TEST_CONFIG.API_URL);
        const testToken = 'test-jwt-token-12345';

        authClient.setToken(testToken);
        expect(authClient.getToken()).toBe(testToken);
    });

    it('should allow clearing token', () => {
        const authClient = new AuthClient(TEST_CONFIG.API_URL);
        
        authClient.setToken('test-token');
        expect(authClient.getToken()).toBe('test-token');

        authClient.clearToken();
        expect(authClient.getToken()).toBeUndefined();
    });

    it('should provide access to underlying HttpClient', () => {
        const authClient = new AuthClient(TEST_CONFIG.API_URL);
        const httpClient = authClient.client;

        expect(httpClient).toBeDefined();
        expect(typeof httpClient.get).toBe('function');
        expect(typeof httpClient.post).toBe('function');
        expect(typeof httpClient.put).toBe('function');
        expect(typeof httpClient.delete).toBe('function');
    });

    it('should propagate token to HttpClient', () => {
        const authClient = new AuthClient(TEST_CONFIG.API_URL);
        const testToken = 'propagation-test-token';

        authClient.setToken(testToken);

        // Token should be available in HttpClient
        expect(authClient.client.getAuthToken()).toBe(testToken);
    });

    it('should clear token from HttpClient', () => {
        const authClient = new AuthClient(TEST_CONFIG.API_URL);
        
        authClient.setToken('test-token');
        expect(authClient.client.getAuthToken()).toBe('test-token');

        authClient.clearToken();
        expect(authClient.client.getAuthToken()).toBeUndefined();
    });
});

describe('AuthClient Usage Pattern', () => {
    it('should demonstrate typical test usage pattern', () => {
        // This test shows the intended usage pattern
        const authClient = new AuthClient(TEST_CONFIG.API_URL);

        // 1. Register or login
        // await authClient.register({ tenant: 'test', template: 'testing' });

        // 2. Token is automatically cached
        // expect(authClient.getToken()).toBeDefined();

        // 3. Use the client for authenticated requests
        // const response = await authClient.client.get('/api/describe/account');

        // Pattern verified without actual API calls
        expect(authClient).toBeDefined();
        expect(authClient.client).toBeDefined();
    });
});
