import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { HttpClient, FormatValidator } from '../http-client.js';

/**
 * Format Response Tests
 *
 * Tests that the API can handle different Content-Type formats:
 * - YAML (application/yaml)
 *
 * These tests verify:
 * 1. Request parsing in different formats
 * 2. Response formatting in requested format
 * 3. Successful authentication with formatted requests
 *
 * Note: TOON format requires optional @anthropic/toon package which may not be installed.
 */

describe('Format Response Middleware', () => {
    let tenant: TestTenant;
    let tenantName: string;
    const httpClient = new HttpClient('http://localhost:9001');

    // Create test tenant before all tests
    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('formatters');
        tenantName = tenant.tenantName;
    });

    describe('YAML Format', () => {
        it('should accept YAML request and return YAML response', async () => {
            // YAML format login request
            const yamlRequest = `tenant: ${tenantName}
username: root
format: yaml`;

            const response = await httpClient.postYaml('/auth/login', yamlRequest);

            // Verify response status
            expect(response.status).toBe(200);

            // Verify response Content-Type matches requested format
            expect(response.headers.get('content-type')).toContain('application/yaml');

            // Verify response is in YAML format
            expect(FormatValidator.isYaml(response.body)).toBe(true);
            expect(response.body).toMatch(/^success:/);

            // Verify successful authentication
            expect(response.body).toContain('success: true');

            // Verify token is present
            expect(response.body).toMatch(/token:/);
        });
    });

    describe('Query Parameter Format (Highest Priority)', () => {
        it('should return YAML when ?format=yaml query parameter is used', async () => {
            // JSON request body with query parameter override
            const response = await httpClient.postJson('/auth/login?format=yaml', {
                tenant: tenantName,
                username: 'root',
            });

            // Verify response status
            expect(response.status).toBe(200);

            // Verify response Content-Type matches query parameter format
            expect(response.headers.get('content-type')).toContain('application/yaml');

            // Verify response is in YAML format (despite JSON request)
            expect(FormatValidator.isYaml(response.body)).toBe(true);
            expect(response.body).toMatch(/^success:/);
        });

        it('should override Accept header with query parameter', async () => {
            // Request with Accept: application/json but ?format=yaml in URL
            // Query parameter should win (higher priority)
            const response = await httpClient.request('/auth/login?format=yaml', {
                method: 'POST',
                contentType: 'application/json',
                accept: 'application/json', // This should be overridden
                body: {
                    tenant: tenantName,
                    username: 'root',
                },
            });

            // Verify response status
            expect(response.status).toBe(200);

            // Verify response is in YAML format (query param overrides Accept header)
            expect(response.headers.get('content-type')).toContain('application/yaml');
            expect(FormatValidator.isYaml(response.body)).toBe(true);
        });

        it('should override request body format field with query parameter', async () => {
            // JSON request body with format: json, but ?format=yaml in URL
            // Query parameter should win (higher priority)
            const response = await httpClient.postJson('/auth/login?format=yaml', {
                tenant: tenantName,
                username: 'root',
                format: 'json',
            });

            // Verify response status
            expect(response.status).toBe(200);

            // Verify response is in YAML format (query param overrides body format field)
            expect(response.headers.get('content-type')).toContain('application/yaml');
            expect(FormatValidator.isYaml(response.body)).toBe(true);
        });
    });

    describe('Format Priority Order', () => {
        it('should use query parameter over Accept header and body format', async () => {
            // This test verifies the complete priority order:
            // 1. Query parameter (highest)
            // 2. Accept header
            // 3. Body format field
            // 4. Default JSON (not tested here)

            // Send JSON with Accept: application/json and ?format=yaml
            const response = await httpClient.request('/auth/login?format=yaml', {
                method: 'POST',
                contentType: 'application/json',
                accept: 'application/json', // Lower priority than query param
                body: {
                    tenant: tenantName,
                    username: 'root',
                    format: 'json', // Even lower priority
                },
            });

            expect(response.status).toBe(200);

            // Query parameter wins: response should be YAML
            expect(response.headers.get('content-type')).toContain('application/yaml');
            expect(FormatValidator.isYaml(response.body)).toBe(true);
            expect(response.body).toContain('success: true');
        });
    });
});
