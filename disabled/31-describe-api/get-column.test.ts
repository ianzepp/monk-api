import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * GET /api/describe/:model/fields/:field - Get Field Details
 *
 * Tests retrieving individual field definitions from the fields table.
 */

describe('GET /api/describe/:model/fields/:field - Get Field Details', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('get-field');

        // Create test model and fields
        await tenant.httpClient.post('/api/describe/products', {
            model_name: 'products',
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

    it('should retrieve field details', async () => {
        const response = await tenant.httpClient.get('/api/describe/products/name');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.model_name).toBe('products');
        expect(response.data.field_name).toBe('name');
    });

    it('should include field type', async () => {
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

    it('should return 404 for non-existent field', async () => {
        const response = await tenant.httpClient.get('/api/describe/products/nonexistent');

        expectError(response);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should return 404 for field in non-existent model', async () => {
        const response = await tenant.httpClient.get('/api/describe/nonexistent/field');

        expectError(response);
    });

    it('should retrieve system model fields', async () => {
        // System models have fields too
        const response = await tenant.httpClient.get('/api/describe/models/model_name');

        expectSuccess(response);
        expect(response.data.model_name).toBe('models');
        expect(response.data.field_name).toBe('model_name');
    });
});
