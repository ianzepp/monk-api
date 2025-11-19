import { describe, it, expect } from 'vitest';
import { HttpClient } from '../http-client.js';

/**
 * Basic Connection Tests
 *
 * Tests that verify the server is running and responding to requests.
 * These are the most fundamental tests that ensure the API is accessible.
 */

describe('Basic Connection (GET /)', () => {
    const httpClient = new HttpClient('http://localhost:9001');

    it('should respond to GET / (server is running)', async () => {
        const response = await httpClient.request('/');

        // Server should respond (even if it's a 404, connection is established)
        expect(response).toBeDefined();
        expect(response.status).toBeDefined();
        expect(typeof response.status).toBe('number');
    });

    it('should return a valid HTTP status code', async () => {
        const response = await httpClient.request('/');

        // Status should be in valid HTTP range (100-599)
        expect(response.status).toBeGreaterThanOrEqual(100);
        expect(response.status).toBeLessThan(600);
    });

    it('should have response headers', async () => {
        const response = await httpClient.request('/');

        expect(response.headers).toBeDefined();
        expect(response.headers).toBeInstanceOf(Headers);
    });

    it('should return a response body', async () => {
        const response = await httpClient.request('/');

        expect(response.body).toBeDefined();
        expect(typeof response.body).toBe('string');
    });
});
