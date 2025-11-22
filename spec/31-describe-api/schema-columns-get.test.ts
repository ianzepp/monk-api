import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe/:schema/columns/:column - Get Column Details
 *
 * Tests retrieving individual column definitions from the columns table.
 */

describe('GET /api/describe/:schema/columns/:column - Get Column Details', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('schema-columns-get');

        // Create test schema with various column types
        await tenant.httpClient.post('/api/describe/test_products', {});

        // Create column with basic constraints
        await tenant.httpClient.post('/api/describe/test_products/columns/name', {
            column_name: 'name',
            type: 'text',
            required: true,
            description: 'Product name',
        });

        // Create column with validation rules
        await tenant.httpClient.post('/api/describe/test_products/columns/price', {
            column_name: 'price',
            type: 'decimal',
            minimum: 0,
            maximum: 1000000,
            description: 'Product price in USD',
        });
    });

    it('should retrieve column details', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/columns/name');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.schema_name).toBe('test_products');
        expect(response.data.column_name).toBe('name');
    });

    it('should include column type', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/columns/name');

        expectSuccess(response);
        expect(response.data.type).toBe('text');
    });

    it('should include constraint flags', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/columns/name');

        expectSuccess(response);
        expect(response.data.required).toBe(true);
    });

    it('should include validation rules', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/columns/price');

        expectSuccess(response);
        expect(response.data.minimum).toBe(0);
        expect(response.data.maximum).toBe(1000000);
    });

    it('should include description', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/columns/name');

        expectSuccess(response);
        expect(response.data.description).toBe('Product name');
    });

    it('should return 404 for non-existent column', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/columns/nonexistent');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should return 404 for column in non-existent schema', async () => {
        const response = await tenant.httpClient.get('/api/describe/nonexistent_schema/columns/some_column');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should retrieve system schema columns', async () => {
        const response = await tenant.httpClient.get('/api/describe/schemas/columns/schema_name');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('schemas');
        expect(response.data.column_name).toBe('schema_name');
        expect(response.data.type).toBeDefined();
    });
});
