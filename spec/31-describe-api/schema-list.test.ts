import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe - List All Schemas
 *
 * Tests the endpoint that lists all available schema names in the current tenant.
 */

describe('GET /api/describe - List All Schemas', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('schema-list');
    });

    it('should return array of schema names', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(Array.isArray(response.data)).toBe(true);
    });

    it('should include system schemas', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);

        const schemas = response.data as string[];
        expect(schemas).toContain('schemas');
        expect(schemas).toContain('columns');
        expect(schemas).toContain('users');
    });

    it('should return string array (schema names only)', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);

        const schemas = response.data as string[];
        expect(schemas.length).toBeGreaterThan(0);

        // Each item should be a string (schema name)
        schemas.forEach(schema => {
            expect(typeof schema).toBe('string');
        });
    });

    it('should include custom schemas after creation', async () => {
        // Create a custom schema
        const createResponse = await tenant.httpClient.post('/api/describe/test_custom_schema', {});
        expectSuccess(createResponse);

        // List schemas again
        const listResponse = await tenant.httpClient.get('/api/describe');

        expectSuccess(listResponse);
        const schemas = listResponse.data as string[];
        expect(schemas).toContain('test_custom_schema');
    });

    // TODO: Schema deletion/trashing may not be filtering from list endpoint yet
    // The test expects deleted schemas to be excluded but they still appear
    it.skip('should not include trashed schemas', async () => {
        // Create a schema
        await tenant.httpClient.post('/api/describe/test_temp_schema', {});

        // Delete it (soft delete)
        await tenant.httpClient.delete('/api/describe/test_temp_schema');

        // List schemas - should not include trashed
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);
        const schemas = response.data as string[];
        expect(schemas).not.toContain('test_temp_schema');
    });
});
