import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe - List All Schemas
 *
 * Tests the endpoint that lists all available schema names in the current tenant.
 * Uses 'default' template which includes system schemas.
 */

describe('GET /api/describe - List All Schemas', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('list-schemas');
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should return array of schema names', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect(Array.isArray(response.data)).toBe(true);
    });

    it('should include system schemas in default template', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expect(response.success).toBe(true);
        
        // Default template should have system schemas
        const schemas = response.data as string[];
        expect(schemas).toContain('schemas');
        expect(schemas).toContain('columns');
        expect(schemas).toContain('users');
    });

    it('should return string array (schema names only)', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expect(response.success).toBe(true);
        
        const schemas = response.data as string[];
        expect(schemas.length).toBeGreaterThan(0);
        
        // Each item should be a string (schema name)
        schemas.forEach(schema => {
            expect(typeof schema).toBe('string');
        });
    });

    it('should include custom schemas after creation', async () => {
        // Create a custom schema
        const createResponse = await tenant.httpClient.post('/api/describe/products', {
            schema_name: 'products',
            status: 'active'
        });
        expect(createResponse.success).toBe(true);

        // List schemas again
        const listResponse = await tenant.httpClient.get('/api/describe');
        
        expect(listResponse.success).toBe(true);
        const schemas = listResponse.data as string[];
        expect(schemas).toContain('products');
    });

    it('should not include trashed schemas', async () => {
        // Create a schema
        await tenant.httpClient.post('/api/describe/temp_schema', {
            schema_name: 'temp_schema',
            status: 'active'
        });

        // Delete it (soft delete)
        await tenant.httpClient.delete('/api/describe/temp_schema');

        // List schemas - should not include trashed
        const response = await tenant.httpClient.get('/api/describe');
        
        expect(response.success).toBe(true);
        const schemas = response.data as string[];
        expect(schemas).not.toContain('temp_schema');
    });
});
