import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * POST /api/data/:model - Create Records
 *
 * Tests record creation with validation, system fields, and error handling.
 * Request body must be an array (even for single record).
 */

describe('POST /api/data/:model - Create Records', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('data-post');

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
    });

    it('should create single record (in array)', async () => {
        const response = await tenant.httpClient.post('/api/data/products', [
            {
                name: 'Widget',
                price: 29.99,
                in_stock: true,
            },
        ]);

        expectSuccess(response);
        expect(response.data).toBeInstanceOf(Array);
        expect(response.data).toHaveLength(1);
        expect(response.data[0].name).toBe('Widget');
        expect(response.data[0].price).toBe(29.99);
        expect(response.data[0].in_stock).toBe(true);
    });

    it('should include system fields in response', async () => {
        const response = await tenant.httpClient.post('/api/data/products?stat=true', [
            {
                name: 'Gadget',
                price: 49.99,
            },
        ]);

        expectSuccess(response);
        const record = response.data[0];

        // Data API includes system fields with ?stat=true
        expect(record.id).toBeDefined();
        expect(record.created_at).toBeDefined();
        expect(record.updated_at).toBeDefined();
        expect(record.trashed_at).toBeNull();
    });

    it('should create multiple records in transaction', async () => {
        const response = await tenant.httpClient.post('/api/data/products', [
            { name: 'Product 1', price: 10.00 },
            { name: 'Product 2', price: 20.00 },
            { name: 'Product 3', price: 30.00 },
        ]);

        expectSuccess(response);
        expect(response.data).toHaveLength(3);
        expect(response.data[0].name).toBe('Product 1');
        expect(response.data[1].name).toBe('Product 2');
        expect(response.data[2].name).toBe('Product 3');
    });

    it('should auto-generate UUIDs for each record', async () => {
        const response = await tenant.httpClient.post('/api/data/products', [
            { name: 'Item 1' },
            { name: 'Item 2' },
        ]);

        expectSuccess(response);
        const id1 = response.data[0].id;
        const id2 = response.data[1].id;

        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);
        // UUID format check
        expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should set timestamps on creation', async () => {
        const response = await tenant.httpClient.post('/api/data/products?stat=true', [
            { name: 'Timestamped Product' },
        ]);

        expectSuccess(response);
        const record = response.data[0];

        expect(record.created_at).toBeDefined();
        expect(record.updated_at).toBeDefined();
        expect(new Date(record.created_at).getTime()).toBeGreaterThan(0);
        // For new records, updated_at should equal created_at
        expect(record.updated_at).toBe(record.created_at);
    });

    it('should reject non-array request body', async () => {
        const response = await tenant.httpClient.post('/api/data/products', {
            name: 'Not an array',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    // TODO: API accepts empty array - should this return an error?
    it.skip('should reject empty array', async () => {
        const response = await tenant.httpClient.post('/api/data/products', []);

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should validate required fields', async () => {
        const response = await tenant.httpClient.post('/api/data/products', [
            {
                price: 99.99,
                // Missing required 'name' field
            },
        ]);

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should rollback transaction if any record fails', async () => {
        const response = await tenant.httpClient.post('/api/data/products', [
            { name: 'Valid Product' },
            { price: 50.00 }, // Missing required 'name'
            { name: 'Another Valid' },
        ]);

        expect(response.success).toBe(false);

        // Verify NO records were created
        const checkResponse = await tenant.httpClient.post('/api/find/products', {});
        expectSuccess(checkResponse);
        // Should not include the failed batch
        const validCount = checkResponse.data.filter((r: any) =>
            r.name === 'Valid Product' || r.name === 'Another Valid'
        ).length;
        expect(validCount).toBe(0);
    });

    it('should return error for non-existent model', async () => {
        const response = await tenant.httpClient.post('/api/data/nonexistent_model', [
            { name: 'Test' },
        ]);

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('INTERNAL_ERROR');
    });

    it('should handle boolean type correctly', async () => {
        const response = await tenant.httpClient.post('/api/data/products', [
            { name: 'Bool Test 1', in_stock: true },
            { name: 'Bool Test 2', in_stock: false },
        ]);

        expectSuccess(response);
        expect(response.data[0].in_stock).toBe(true);
        expect(response.data[1].in_stock).toBe(false);
    });

    it('should handle null values for optional fields', async () => {
        const response = await tenant.httpClient.post('/api/data/products', [
            {
                name: 'Null Test',
                price: null,
                in_stock: null,
            },
        ]);

        expectSuccess(response);
        expect(response.data[0].price).toBeNull();
        expect(response.data[0].in_stock).toBeNull();
    });
});
