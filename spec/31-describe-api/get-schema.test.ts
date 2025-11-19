import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe/:schema - Get Schema Details
 *
 * Tests retrieving schema metadata (without columns array).
 * Columns must be retrieved separately via column endpoints.
 */

describe('GET /api/describe/:schema - Get Schema Details', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('get-schema');

        // Create test schemas
        await tenant.httpClient.post('/api/describe/products', {
            schema_name: 'products',
            status: 'active',
            description: 'Product catalog'
        });

        await tenant.httpClient.post('/api/describe/protected_schema', {
            schema_name: 'protected_schema',
            status: 'active',
            sudo: true,
            freeze: false,
            immutable: false
        });
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should retrieve schema metadata', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect(response.data.schema_name).toBe('products');
    });

    it('should include status field', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expect(response.success).toBe(true);
        expect(response.data.status).toBe('active');
    });

    it('should include description field', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expect(response.success).toBe(true);
        expect(response.data.description).toBe('Product catalog');
    });

    it('should include protection flags', async () => {
        const response = await tenant.httpClient.get('/api/describe/protected_schema');

        expect(response.success).toBe(true);
        expect(response.data.sudo).toBe(true);
        expect(response.data.freeze).toBe(false);
        expect(response.data.immutable).toBe(false);
    });

    it('should not include system fields in response', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expect(response.success).toBe(true);
        
        // System fields should be filtered out
        expect(response.data.id).toBeUndefined();
        expect(response.data.created_at).toBeUndefined();
        expect(response.data.updated_at).toBeUndefined();
        expect(response.data.trashed_at).toBeUndefined();
    });

    it('should not include columns array (new architecture)', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expect(response.success).toBe(true);
        
        // Columns are not included in schema GET response
        expect(response.data.columns).toBeUndefined();
    });

    it('should return 404 for non-existent schema', async () => {
        const response = await tenant.httpClient.get('/api/describe/nonexistent');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });

    it('should retrieve system schemas', async () => {
        const response = await tenant.httpClient.get('/api/describe/schemas');

        expect(response.success).toBe(true);
        expect(response.data.schema_name).toBe('schemas');
        expect(response.data.status).toBe('system');
    });

    it('should not retrieve trashed schemas', async () => {
        // Create and then delete a schema
        await tenant.httpClient.post('/api/describe/temp_schema', {
            schema_name: 'temp_schema'
        });
        
        await tenant.httpClient.delete('/api/describe/temp_schema');

        // Try to retrieve deleted schema
        const response = await tenant.httpClient.get('/api/describe/temp_schema');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });
});
