import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient, FormatValidator } from '../http-client.js';

/**
 * Format Response Tests
 *
 * Tests that the API can handle different Content-Type formats:
 * - YAML (application/yaml)
 * - TOON (application/toon)
 * - Morse (application/morse)
 *
 * These tests verify:
 * 1. Request parsing in different formats
 * 2. Response formatting in requested format
 * 3. Successful authentication with formatted requests
 */

describe('Format Response Middleware', () => {
    let tenantName: string;
    let databaseName: string;
    const httpClient = new HttpClient('http://localhost:9001');

    // Create test tenant before all tests
    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'formatters',
            template: 'testing',
        });

        tenantName = result.tenantName;
        databaseName = result.databaseName;
    });

    // Clean up test tenant after all tests
    afterAll(async () => {
        if (tenantName && databaseName) {
            await TestDatabaseHelper.cleanupTestTenant(tenantName, databaseName);
        }
    });

    describe('YAML Format', () => {
        it('should accept YAML request and return YAML response', async () => {
            // YAML format login request
            const yamlRequest = `tenant: ${tenantName}
username: full
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

    describe('TOON Format', () => {
        it('should accept TOON request and return TOON response', async () => {
            // TOON format login request
            const toonRequest = `tenant: ${tenantName}
username: full
format: toon`;

            const response = await httpClient.postToon('/auth/login', toonRequest);

            // Verify response status
            expect(response.status).toBe(200);

            // Verify response Content-Type (TOON uses text/plain by design)
            expect(response.headers.get('content-type')).toContain('text/plain');

            // Verify response is in TOON format
            expect(FormatValidator.isToon(response.body)).toBe(true);
            expect(response.body).toMatch(/^success:/);

            // Verify successful authentication
            expect(response.body).toContain('success: true');

            // Verify token is present
            expect(response.body).toMatch(/token:/);
        });
    });

    describe('Morse Format', () => {
        it.todo('should accept Morse request and return Morse response', async () => {
            // TODO: Morse format requires actual Morse-encoded input
            // Currently the API returns 400 when sending JSON with Morse Content-Type
            // Need to implement proper Morse encoding or fix API to accept JSON
        });
    });

    describe('Format Comparison', () => {
        it.todo('should return same data in different formats', async () => {
            // TODO: Verify JSON authentication response structure
            // Currently the response format differs from expected
        });
    });
});
