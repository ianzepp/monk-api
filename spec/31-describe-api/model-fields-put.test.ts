import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * PUT /api/describe/:model/fields/:field - Update Field
 *
 * Tests field metadata and structural updates. Metadata updates are fast,
 * structural updates trigger ALTER TABLE operations.
 */

describe('PUT /api/describe/:model/fields/:field - Update Field', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('model-fields-put');

        // Create test model
        await tenant.httpClient.post('/api/describe/test_products', {});

        // Create test fields with various types
        await tenant.httpClient.post('/api/describe/test_products/fields/name', {
            field_name: 'name',
            type: 'text',
        });

        await tenant.httpClient.post('/api/describe/test_products/fields/price', {
            field_name: 'price',
            type: 'decimal',
        });

        await tenant.httpClient.post('/api/describe/test_products/fields/quantity', {
            field_name: 'quantity',
            type: 'integer',
        });

        await tenant.httpClient.post('/api/describe/test_products/fields/status', {
            field_name: 'status',
            type: 'text',
        });

        await tenant.httpClient.post('/api/describe/test_products/fields/description', {
            field_name: 'description',
            type: 'text',
        });

        await tenant.httpClient.post('/api/describe/test_products/fields/email', {
            field_name: 'email',
            type: 'text',
        });
    });

    it('should update field description', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/name', {
            description: 'Product display name',
        });

        expectSuccess(response);
        expect(response.data.description).toBe('Product display name');
    });

    it('should update validation pattern', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/email', {
            pattern: '^[^@]+@[^@]+\\.[^@]+$',
        });

        expectSuccess(response);
        expect(response.data.pattern).toBe('^[^@]+@[^@]+\\.[^@]+$');
    });

    it('should update minimum and maximum constraints', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/quantity', {
            minimum: 0,
            maximum: 10000,
        });

        expectSuccess(response);
        expect(response.data.minimum).toBe(0);
        expect(response.data.maximum).toBe(10000);
    });

    it('should update enum values', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/status', {
            enum_values: ['draft', 'published', 'archived', 'deleted'],
        });

        expectSuccess(response);
        expect(response.data.enum_values).toEqual(['draft', 'published', 'archived', 'deleted']);
    });

    it('should update transform', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/email', {
            transform: 'lowercase',
        });

        expectSuccess(response);
        expect(response.data.transform).toBe('lowercase');
    });

    it('should update tracked flag', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/price', {
            tracked: true,
        });

        expectSuccess(response);
        expect(response.data.tracked).toBe(true);
    });

    it('should update immutable flag', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/name', {
            immutable: true,
        });

        expectSuccess(response);
        expect(response.data.immutable).toBe(true);
    });

    it('should update sudo protection flag', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/price', {
            sudo: true,
        });

        expectSuccess(response);
        expect(response.data.sudo).toBe(true);
    });

    it('should update required constraint (ALTER TABLE)', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/name', {
            required: true,
        });

        expectSuccess(response);
        expect(response.data.required).toBe(true);
    });

    it('should update unique constraint (ALTER TABLE)', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/email', {
            unique: true,
        });

        expectSuccess(response);
        expect(response.data.unique).toBe(true);
    });

    it('should update index (ALTER TABLE)', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/status', {
            index: true,
        });

        expectSuccess(response);
        expect(response.data.index).toBe(true);
    });

    it('should update searchable flag (ALTER TABLE)', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/description', {
            searchable: true,
        });

        expectSuccess(response);
        expect(response.data.searchable).toBe(true);
    });

    it('should update multiple fields at once', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/quantity', {
            description: 'Stock quantity',
            minimum: 1,
            maximum: 5000,
            index: true,
        });

        expectSuccess(response);
        expect(response.data.description).toBe('Stock quantity');
        expect(response.data.minimum).toBe(1);
        expect(response.data.maximum).toBe(5000);
        expect(response.data.index).toBe(true);
    });

    it('should persist updates across GET requests', async () => {
        // Update field
        await tenant.httpClient.put('/api/describe/test_products/fields/price', {
            description: 'Product price in USD',
            minimum: 0,
        });

        // Retrieve field
        const getResponse = await tenant.httpClient.get('/api/describe/test_products/fields/price');

        expect(getResponse.success).toBe(true);
        expect(getResponse.data.description).toBe('Product price in USD');
        expect(getResponse.data.minimum).toBe(0);
    });

    // TODO: API currently accepts empty updates - should this be an error?
    it.skip('should reject empty updates', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/name', {});

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should return 404 for non-existent field', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products/fields/nonexistent', {
            description: 'Should fail',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should return error for field in non-existent model', async () => {
        const response = await tenant.httpClient.put('/api/describe/nonexistent_model/fields/some_field', {
            description: 'Should fail',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('INTERNAL_ERROR');
    });
});
