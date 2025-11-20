import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe/:schema/:column - Get Column Details
 *
 * Tests retrieving individual column definitions from the columns table.
 */

describe('GET /api/describe/:schema/:column - Get Column Details', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('get-column');

        // Create test schema and columns
        await tenant.httpClient.post('/api/describe/products', {
            schema_name: 'products',
            status: 'active'
        });

        await tenant.httpClient.post('/api/describe/products/name', {
            type: 'text',
            required: true,
            description: 'Product name'
        });

        await tenant.httpClient.post('/api/describe/products/price', {
            type: 'decimal',
            minimum: 0,
            maximum: 1000000,
            description: 'Product price in USD'
        });
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should retrieve column details', async () => {
        const response = await tenant.httpClient.get('/api/describe/products/name');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.schema_name).toBe('products');
        expect(response.data.column_name).toBe('name');
    });

    it('should include column type', async () => {
        const response = await tenant.httpClient.get('/api/describe/products/name');

        expectSuccess(response);
        expect(response.data.type).toBe('text');
    });

    it('should include constraint flags', async () => {
        const response = await tenant.httpClient.get('/api/describe/products/name');

        expectSuccess(response);
        expect(response.data.required).toBe(true);
    });

    it('should include validation rules', async () => {
        const response = await tenant.httpClient.get('/api/describe/products/price');

        expectSuccess(response);
        expect(response.data.minimum).toBe(0);
        expect(response.data.maximum).toBe(1000000);
    });

    it('should include description', async () => {
        const response = await tenant.httpClient.get('/api/describe/products/name');

        expectSuccess(response);
        expect(response.data.description).toBe('Product name');
    });

    it('should return 404 for non-existent column', async () => {
        const response = await tenant.httpClient.get('/api/describe/products/nonexistent');

        expectError(response);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should return 404 for column in non-existent schema', async () => {
        const response = await tenant.httpClient.get('/api/describe/nonexistent/column');

        expectError(response);
    });

    it('should retrieve system schema columns', async () => {
        // System schemas have columns too
        const response = await tenant.httpClient.get('/api/describe/schemas/schema_name');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('schemas');
        expect(response.data.column_name).toBe('schema_name');
    });
});
