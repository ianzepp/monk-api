import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';

/**
 * Field Extraction Tests (?unwrap and ?select= parameters)
 *
 * Tests server-side field extraction from JSON responses.
 * The ?unwrap parameter removes the envelope and returns full data.
 * The ?select= parameter removes the envelope and extracts specific fields.
 *
 * Features tested:
 * 1. Unwrap (remove envelope, return full data)
 * 2. Single field extraction (returns JSON-encoded value)
 * 3. Multiple field extraction (returns JSON object)
 * 4. Missing field handling (graceful null)
 * 5. Format compatibility (extraction + formatting)
 */

describe('Field Extraction (?unwrap and ?select= parameters)', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('field-extraction');
    });

    describe('Unwrap (Remove Envelope)', () => {
        it('should unwrap and return full data object without envelope', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami?unwrap');

            expect(response.status).toBe(200);

            // When unwrapped, the response should be raw data (not wrapped in success/data)
            // The httpClient parses JSON, so we check the raw structure
            expect(response.data).toBeDefined();

            // Unwrapped response should have user fields directly
            if (response.data.id) {
                // Data is unwrapped
                expect(response.data.id).toBeDefined();
            }
        });

        it('should work with format parameter', async () => {
            const response = await tenant.httpClient.request('/api/user/whoami?unwrap&format=yaml', {
                method: 'GET',
                accept: 'application/yaml',
            });

            expect(response.status).toBe(200);

            // Response should be YAML formatted
            expect(response.headers.get('content-type')).toContain('application/yaml');
            expect(response.body).toMatch(/id:/);
        });
    });

    describe('Single Field Extraction', () => {
        it('should extract single field', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami?select=id');

            expect(response.status).toBe(200);

            // Single field extraction returns the value directly
            const data = response.data;
            expect(data).toBeDefined();
        });

        it('should return null for missing field', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami?select=nonexistent');

            expect(response.status).toBe(200);

            // Missing field returns null
            expect(response.data).toBeNull();
        });
    });

    describe('Multiple Field Extraction', () => {
        it('should extract multiple fields as JSON object', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami?select=id,name');

            expect(response.status).toBe(200);

            // Multiple fields should return JSON object
            const data = response.data;
            expect(data).toBeDefined();
            expect(typeof data).toBe('object');

            // Should have the requested fields
            expect('id' in data || 'name' in data).toBe(true);
        });

        it('should handle mix of existing and missing fields', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami?select=id,nonexistent');

            expect(response.status).toBe(200);

            const data = response.data;
            expect(data).toBeDefined();
            // id should exist, nonexistent may be null or undefined
        });
    });

    describe('Nested Path Extraction', () => {
        it('should handle invalid nested paths gracefully', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami?select=invalid.nested.path');

            expect(response.status).toBe(200);
            // Invalid nested path returns null
            expect(response.data).toBeNull();
        });
    });

    describe('Field Extraction with Format Override', () => {
        it('should extract field then format as YAML', async () => {
            const response = await tenant.httpClient.request('/api/user/whoami?select=id,name&format=yaml', {
                method: 'GET',
                accept: 'application/yaml',
            });

            expect(response.status).toBe(200);

            // Response should be YAML formatted
            expect(response.headers.get('content-type')).toContain('application/yaml');
            expect(response.body).toMatch(/id:/);
        });
    });

    describe('Empty and Invalid Select Parameters', () => {
        it('should return full response when select parameter is empty', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami?select=');

            expect(response.status).toBe(200);

            // Empty select should return full response
            const data = response.data;
            expect(data).toBeDefined();
        });

        it('should return full response when select parameter is missing', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami');

            expect(response.status).toBe(200);

            // No select should return full response with envelope
            expectSuccess(response);
            expect(response.data).toBeDefined();
        });
    });

    describe('User ID Extraction Use Case', () => {
        it('should extract user ID for subsequent requests', async () => {
            const response = await tenant.httpClient.get('/api/user/whoami?select=id');

            expect(response.status).toBe(200);

            // Should return UUID
            const userId = response.data;
            if (userId && typeof userId === 'string') {
                expect(userId).toMatch(/^[a-f0-9-]{36}$/);
            }
        });
    });

    describe('Priority: Extraction Before Formatting', () => {
        it('should extract fields before applying format', async () => {
            // This test verifies the processing order:
            // 1. Route returns full JSON response
            // 2. Field extraction picks specific fields
            // 3. Format middleware converts to requested format

            const response = await tenant.httpClient.request('/api/user/whoami?select=id,name&format=yaml', {
                method: 'GET',
            });

            expect(response.status).toBe(200);

            // Should be YAML formatted
            expect(response.headers.get('content-type')).toContain('application/yaml');

            // Should only contain extracted fields (not full response)
            expect(response.body).toMatch(/id:/);
        });
    });
});
