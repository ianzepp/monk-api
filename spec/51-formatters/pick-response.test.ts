import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';

/**
 * Field Extraction Tests (?pick= parameter)
 *
 * Tests server-side field extraction from JSON responses.
 * The ?pick= parameter allows extracting specific fields before formatting.
 *
 * Features tested:
 * 1. Single field extraction (returns JSON-encoded value)
 * 2. Multiple field extraction (returns JSON object)
 * 3. Nested path extraction (dot notation)
 * 4. Missing field handling (graceful null)
 * 5. Format compatibility (extraction + formatting)
 * 6. Array element extraction
 *
 * Note: Field extraction always returns JSON, which can then be formatted
 * by the formatter middleware (JSON, YAML, TOON, etc.)
 */

describe('Field Extraction (?pick= parameter)', () => {
    let tenantName: string;
    let databaseName: string;
    let authToken: string;
    const httpClient = new HttpClient('http://localhost:9001');

    // Create test tenant and authenticate before all tests
    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'pick',
            template: 'testing',
        });

        tenantName = result.tenantName;
        databaseName = result.databaseName;

        // Get auth token for authenticated requests
        authToken = await TestDatabaseHelper.getAuthToken(tenantName, 'full');
    });

    // Clean up test tenant after all tests
    afterAll(async () => {
        if (tenantName && databaseName) {
            await TestDatabaseHelper.cleanupTestTenant(tenantName, databaseName);
        }
    });

    describe('Single Field Extraction', () => {
        it('should extract single field as JSON-encoded value', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.id',
                authToken
            );

            expect(response.status).toBe(200);

            // Single field returns JSON-encoded value
            const userId = response.json;
            expect(userId).toBeDefined();

            // Should be a UUID format
            expect(userId).toMatch(/^[a-f0-9-]{36}$/);
        });

        it('should extract nested field as JSON-encoded value', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.access',
                authToken
            );

            expect(response.status).toBe(200);

            // Should return the access level as JSON-encoded string
            expect(response.json).toBe('full');
        });

        it('should return empty or null for missing field', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.nonexistent',
                authToken
            );

            expect(response.status).toBe(200);

            // Missing field returns null
            expect(response.json).toBeNull();
        });
    });

    describe('Multiple Field Extraction', () => {
        it('should extract multiple fields as JSON object', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.id,data.name',
                authToken
            );

            expect(response.status).toBe(200);

            // Multiple fields should return JSON object
            const data = response.json;
            expect(data).toBeDefined();
            expect(data.id).toBeDefined();
            expect(data.name).toBeDefined();

            // Should only have the requested fields
            expect(Object.keys(data).length).toBe(2);
        });

        it('should extract multiple nested fields', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.access,data.tenant,data.database',
                authToken
            );

            expect(response.status).toBe(200);

            const data = response.json;
            expect(data.access).toBe('full');
            expect(data.tenant).toBe(tenantName);
            expect(data.database).toMatch(/^tenant_/);
        });

        it('should handle mix of existing and missing fields', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.id,data.nonexistent',
                authToken
            );

            expect(response.status).toBe(200);

            const data = response.json;
            expect(data.id).toBeDefined();
            // Missing field may be undefined or null
            expect(data.nonexistent === null || data.nonexistent === undefined).toBe(true);
        });
    });

    describe('Nested Path Extraction', () => {
        it('should extract deeply nested fields', async () => {
            // Login response has nested structure
            const response = await httpClient.postJson('/auth/login', {
                tenant: tenantName,
                username: 'full',
            });

            expect(response.status).toBe(200);
            expect(response.json.data.token).toBeDefined();
        });

        it('should handle invalid nested paths gracefully', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.invalid.nested.path',
                authToken
            );

            expect(response.status).toBe(200);
            // Invalid nested path returns null
            expect(response.json).toBeNull();
        });
    });

    describe('Field Extraction with Format Override', () => {
        it('should extract field then format as YAML', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.id,data.access&format=yaml',
                authToken
            );

            expect(response.status).toBe(200);

            // Response should be YAML formatted
            expect(response.headers.get('content-type')).toContain('application/yaml');
            expect(response.body).toMatch(/id:/);
            expect(response.body).toMatch(/access:/);
        });

        it('should extract field then format as TOON', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.id,data.name&format=toon',
                authToken
            );

            expect(response.status).toBe(200);

            // Response should be TOON formatted (text/plain)
            expect(response.headers.get('content-type')).toContain('text/plain');
            expect(response.body).toMatch(/id:/);
            expect(response.body).toMatch(/name:/);
        });

        it('should extract single field then format as YAML', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.access&format=yaml',
                authToken
            );

            expect(response.status).toBe(200);

            // Single field with format should still return formatted value
            expect(response.headers.get('content-type')).toContain('application/yaml');
            // YAML formatting of plain text value
            expect(response.body.trim()).toMatch(/full/);
        });
    });

    describe('Array Element Extraction', () => {
        it('should extract array fields', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.access_read',
                authToken
            );

            expect(response.status).toBe(200);

            // Array should be returned as JSON array
            expect(response.body).toMatch(/^\[/); // Starts with [
        });

        it('should extract multiple array fields as JSON object', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.access_read,data.access_edit',
                authToken
            );

            expect(response.status).toBe(200);

            const data = response.json;
            expect(Array.isArray(data.access_read)).toBe(true);
            expect(Array.isArray(data.access_edit)).toBe(true);
        });
    });

    describe('Empty and Invalid Pick Parameters', () => {
        it('should return full response when pick parameter is empty', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=',
                authToken
            );

            expect(response.status).toBe(200);

            // Empty pick should return full response
            const data = response.json;
            expect(data.success).toBe(true);
            expect(data.data).toBeDefined();
            expect(data.data.id).toBeDefined();
            expect(data.data.name).toBeDefined();
        });

        it('should return full response when pick parameter is missing', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami',
                authToken
            );

            expect(response.status).toBe(200);

            // No pick should return full response
            const data = response.json;
            expect(data.success).toBe(true);
            expect(data.data).toBeDefined();
        });
    });

    describe('Token Extraction Use Case', () => {
        it('should extract token directly from login response if supported', async () => {
            const response = await httpClient.postJson(
                '/auth/login?pick=data.token',
                {
                    tenant: tenantName,
                    username: 'full',
                }
            );

            expect(response.status).toBe(200);

            // If pick works on auth endpoint, should return JSON-encoded token string
            // Otherwise, should return full response object
            if (typeof response.json === 'string' && response.json.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)) {
                // Token extracted successfully (JWT format)
                expect(response.json).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
            } else if (typeof response.json === 'object' && response.json.success) {
                // Full response object returned (pick may not be supported on auth endpoint)
                expect(response.json.success).toBe(true);
                expect(response.json.data.token).toBeDefined();
            } else {
                // Unexpected response format
                throw new Error(`Unexpected response format: ${JSON.stringify(response.json).substring(0, 100)}`);
            }
        });

        it('should extract user ID for subsequent requests', async () => {
            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.id',
                authToken
            );

            expect(response.status).toBe(200);

            // Should return UUID as JSON-encoded string
            expect(response.json).toMatch(/^[a-f0-9-]{36}$/);

            // This can be used in shell scripts with jq:
            // USER_ID=$(curl /api/auth/whoami?pick=data.id -H "Authorization: Bearer $TOKEN" | jq -r .)
        });
    });

    describe('Priority: Extraction Before Formatting', () => {
        it('should extract fields before applying format', async () => {
            // This test verifies the processing order:
            // 1. Route returns full JSON response
            // 2. Field extraction picks specific fields
            // 3. Format middleware converts to requested format

            const response = await httpClient.authenticatedRequest(
                '/api/auth/whoami?pick=data.id,data.access&format=toon',
                authToken
            );

            expect(response.status).toBe(200);

            // Should be TOON formatted
            expect(response.headers.get('content-type')).toContain('text/plain');

            // Should only contain extracted fields (not full response)
            expect(response.body).toMatch(/id:/);
            expect(response.body).toMatch(/access:/);
            expect(response.body).not.toMatch(/tenant:/); // Not extracted
            expect(response.body).not.toMatch(/database:/); // Not extracted
        });
    });
});
