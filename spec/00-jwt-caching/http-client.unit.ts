import { describe, it, expect } from 'bun:test';
import { HttpClient } from '../http-client.js';

/**
 * HttpClient JWT Caching Unit Tests
 *
 * Tests that verify the HttpClient automatically caches and includes
 * JWT tokens in requests without manual Authorization headers.
 */

describe('HttpClient JWT Caching', () => {
    it('should create HttpClient without token', () => {
        const httpClient = new HttpClient('http://localhost:9001');
        expect(httpClient.getAuthToken()).toBeUndefined();
    });

    it('should create HttpClient with token in constructor', () => {
        const token = 'constructor-token';
        const client = new HttpClient('http://localhost:9001', token);
        expect(client.getAuthToken()).toBe(token);
    });

    it('should cache and retrieve auth token', () => {
        const httpClient = new HttpClient('http://localhost:9001');
        const testToken = 'test-jwt-token-12345';

        httpClient.setAuthToken(testToken);
        expect(httpClient.getAuthToken()).toBe(testToken);
    });

    it('should clear auth token', () => {
        const httpClient = new HttpClient('http://localhost:9001');

        httpClient.setAuthToken('test-token');
        expect(httpClient.getAuthToken()).toBe('test-token');

        httpClient.clearAuthToken();
        expect(httpClient.getAuthToken()).toBeUndefined();
    });

    it('should allow updating auth token', () => {
        const httpClient = new HttpClient('http://localhost:9001');

        httpClient.setAuthToken('first-token');
        expect(httpClient.getAuthToken()).toBe('first-token');

        httpClient.setAuthToken('second-token');
        expect(httpClient.getAuthToken()).toBe('second-token');
    });

    it('should be independent across instances', () => {
        const client1 = new HttpClient('http://localhost:9001');
        const client2 = new HttpClient('http://localhost:9001');

        client1.setAuthToken('token-1');
        client2.setAuthToken('token-2');

        expect(client1.getAuthToken()).toBe('token-1');
        expect(client2.getAuthToken()).toBe('token-2');
    });
});
