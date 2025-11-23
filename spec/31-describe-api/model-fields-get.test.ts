import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe/:model/fields/:field - Get Field Details
 *
 * Tests retrieving individual field definitions from the fields table.
 */

describe('GET /api/describe/:model/fields/:field - Get Field Details', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('model-fields-get');

        // Create test model with various field types
        await tenant.httpClient.post('/api/describe/test_products', {});

        // Create field with basic constraints
        await tenant.httpClient.post('/api/describe/test_products/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
            description: 'Product name',
        });

        // Create field with validation rules
        await tenant.httpClient.post('/api/describe/test_products/fields/price', {
            field_name: 'price',
            type: 'decimal',
            minimum: 0,
            maximum: 1000000,
            description: 'Product price in USD',
        });
    });

    it('should retrieve field details', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/fields/name');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.model_name).toBe('test_products');
        expect(response.data.field_name).toBe('name');
    });

    it('should include field type', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/fields/name');

        expectSuccess(response);
        expect(response.data.type).toBe('text');
    });

    it('should include constraint flags', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/fields/name');

        expectSuccess(response);
        expect(response.data.required).toBe(true);
    });

    it('should include validation rules', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/fields/price');

        expectSuccess(response);
        expect(response.data.minimum).toBe(0);
        expect(response.data.maximum).toBe(1000000);
    });

    it('should include description', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/fields/name');

        expectSuccess(response);
        expect(response.data.description).toBe('Product name');
    });

    it('should return 404 for non-existent field', async () => {
        const response = await tenant.httpClient.get('/api/describe/test_products/fields/nonexistent');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should return 404 for field in non-existent model', async () => {
        const response = await tenant.httpClient.get('/api/describe/nonexistent_model/fields/some_field');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should retrieve system model fields', async () => {
        const response = await tenant.httpClient.get('/api/describe/models/fields/model_name');

        expectSuccess(response);
        expect(response.data.model_name).toBe('models');
        expect(response.data.field_name).toBe('model_name');
        expect(response.data.type).toBeDefined();
    });
});
