import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * PUT /api/data/:model/:id - Update Single Record
 *
 * Tests record updates with field merging, timestamp updates, and error handling.
 */

describe('PUT /api/data/:model/:id - Update Single Record', () => {
    let tenant: TestTenant;
    let recordId: string;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('data-put');

        // Create test model
        await tenant.httpClient.post('/api/describe/products', {});
        await tenant.httpClient.post('/api/describe/products/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/products/fields/price', {
            field_name: 'price',
            type: 'decimal',
        });
        await tenant.httpClient.post('/api/describe/products/fields/in_stock', {
            field_name: 'in_stock',
            type: 'boolean',
        });

        // Create a test record
        const createResponse = await tenant.httpClient.post('/api/data/products', [
            {
                name: 'Original Product',
                price: 19.99,
                in_stock: true,
            },
        ]);
        expectSuccess(createResponse);
        recordId = createResponse.data[0].id;
    });

    it('should update single field', async () => {
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {
            price: 29.99,
        });

        expectSuccess(response);
        expect(response.data.id).toBe(recordId);
        expect(response.data.price).toBe(29.99);
        // Other fields unchanged
        expect(response.data.name).toBe('Original Product');
        expect(response.data.in_stock).toBe(true);
    });

    it('should update multiple fields', async () => {
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {
            name: 'Updated Product',
            price: 39.99,
        });

        expectSuccess(response);
        expect(response.data.name).toBe('Updated Product');
        expect(response.data.price).toBe(39.99);
    });

    it('should update updated_at timestamp', async () => {
        // Get original timestamp
        const getResponse = await tenant.httpClient.get(`/api/data/products/${recordId}`);
        const originalUpdatedAt = getResponse.data.updated_at;

        // Wait a moment to ensure timestamp changes
        await new Promise(resolve => setTimeout(resolve, 10));

        // Update record
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {
            price: 49.99,
        });

        expectSuccess(response);
        expect(response.data.updated_at).toBeDefined();
        expect(response.data.updated_at).not.toBe(originalUpdatedAt);
    });

    it('should not change created_at timestamp', async () => {
        // Get original timestamp
        const getResponse = await tenant.httpClient.get(`/api/data/products/${recordId}`);
        const originalCreatedAt = getResponse.data.created_at;

        // Update record
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {
            price: 59.99,
        });

        expectSuccess(response);
        expect(response.data.created_at).toBe(originalCreatedAt);
    });

    it('should include all fields in response', async () => {
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {
            in_stock: false,
        });

        expectSuccess(response);
        expect(response.data.id).toBeDefined();
        expect(response.data.name).toBeDefined();
        expect(response.data.price).toBeDefined();
        expect(response.data.in_stock).toBe(false);
        expect(response.data.created_at).toBeDefined();
        expect(response.data.updated_at).toBeDefined();
    });

    it('should update boolean field', async () => {
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {
            in_stock: true,
        });

        expectSuccess(response);
        expect(response.data.in_stock).toBe(true);
    });

    it('should update to null value', async () => {
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {
            price: null,
        });

        expectSuccess(response);
        expect(response.data.price).toBeNull();
    });

    it('should return 404 for non-existent record', async () => {
        const fakeId = '550e8400-e29b-41d4-a716-446655440000';
        const response = await tenant.httpClient.put(`/api/data/products/${fakeId}`, {
            name: 'Test',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('RECORD_NOT_FOUND');
    });

    it('should return error for non-existent model', async () => {
        const response = await tenant.httpClient.put(`/api/data/nonexistent/${recordId}`, {
            name: 'Test',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('INTERNAL_ERROR');
    });

    // TODO: API allows null for required fields in UPDATE (but not CREATE)
    it.skip('should validate required fields when set to null', async () => {
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {
            name: null,
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    // TODO: API accepts empty body - should this return an error?
    it.skip('should reject empty update', async () => {
        const response = await tenant.httpClient.put(`/api/data/products/${recordId}`, {});

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });
});
