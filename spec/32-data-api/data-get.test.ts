import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * GET /api/data/:model/:id - Retrieve Single Record
 *
 * Tests record retrieval by UUID including system fields and error handling.
 */

describe('GET /api/data/:model/:id - Retrieve Single Record', () => {
    let tenant: TestTenant;
    let recordId: string;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('data-get');

        // Create test model
        await tenant.httpClient.post('/api/describe/customers', {});
        await tenant.httpClient.post('/api/describe/customers/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/customers/fields/email', {
            field_name: 'email',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/customers/fields/active', {
            field_name: 'active',
            type: 'boolean',
        });

        // Create a test record
        const createResponse = await tenant.httpClient.post('/api/data/customers', [
            {
                name: 'John Doe',
                email: 'john@example.com',
                active: true,
            },
        ]);
        expectSuccess(createResponse);
        recordId = createResponse.data[0].id;
    });

    it('should retrieve record by ID', async () => {
        const response = await tenant.httpClient.get(`/api/data/customers/${recordId}`);

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.id).toBe(recordId);
        expect(response.data.name).toBe('John Doe');
        expect(response.data.email).toBe('john@example.com');
        expect(response.data.active).toBe(true);
    });

    it('should include system fields', async () => {
        const response = await tenant.httpClient.get(`/api/data/customers/${recordId}?stat=true`);

        expectSuccess(response);
        expect(response.data.id).toBeDefined();
        expect(response.data.created_at).toBeDefined();
        expect(response.data.updated_at).toBeDefined();
        expect(response.data.trashed_at).toBeNull();
    });

    it('should return single record (not array)', async () => {
        const response = await tenant.httpClient.get(`/api/data/customers/${recordId}`);

        expectSuccess(response);
        expect(response.data).toBeInstanceOf(Object);
        expect(Array.isArray(response.data)).toBe(false);
    });

    it('should return 404 for non-existent record', async () => {
        const fakeId = '550e8400-e29b-41d4-a716-446655440000';
        const response = await tenant.httpClient.get(`/api/data/customers/${fakeId}`);

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('RECORD_NOT_FOUND');
    });

    it('should return 404 for invalid UUID format', async () => {
        const response = await tenant.httpClient.get('/api/data/customers/not-a-uuid');

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should return error for non-existent model', async () => {
        const response = await tenant.httpClient.get(`/api/data/nonexistent_model/${recordId}`);

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('INTERNAL_ERROR');
    });

    it('should retrieve record with all data types', async () => {
        // Create model with multiple types
        await tenant.httpClient.post('/api/describe/products', {});
        await tenant.httpClient.post('/api/describe/products/fields/name', {
            field_name: 'name',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/products/fields/price', {
            field_name: 'price',
            type: 'decimal',
        });
        await tenant.httpClient.post('/api/describe/products/fields/quantity', {
            field_name: 'quantity',
            type: 'integer',
        });
        await tenant.httpClient.post('/api/describe/products/fields/available', {
            field_name: 'available',
            type: 'boolean',
        });

        // Create record
        const createResponse = await tenant.httpClient.post('/api/data/products', [
            {
                name: 'Widget',
                price: 29.99,
                quantity: 100,
                available: true,
            },
        ]);
        const productId = createResponse.data[0].id;

        // Retrieve record
        const response = await tenant.httpClient.get(`/api/data/products/${productId}`);

        expectSuccess(response);
        expect(response.data.name).toBe('Widget');
        expect(response.data.price).toBe(29.99);
        expect(response.data.quantity).toBe(100);
        expect(response.data.available).toBe(true);
    });

    it('should handle null field values', async () => {
        // Create record with null values
        const createResponse = await tenant.httpClient.post('/api/data/customers', [
            {
                name: 'Null Test',
                email: null,
                active: null,
            },
        ]);
        const customerId = createResponse.data[0].id;

        // Retrieve record
        const response = await tenant.httpClient.get(`/api/data/customers/${customerId}`);

        expectSuccess(response);
        expect(response.data.name).toBe('Null Test');
        expect(response.data.email).toBeNull();
        expect(response.data.active).toBeNull();
    });

    it('should retrieve immediately after creation', async () => {
        // Create record
        const createResponse = await tenant.httpClient.post('/api/data/customers', [
            {
                name: 'Immediate Test',
                email: 'immediate@example.com',
            },
        ]);
        const customerId = createResponse.data[0].id;

        // Retrieve immediately
        const response = await tenant.httpClient.get(`/api/data/customers/${customerId}`);

        expectSuccess(response);
        expect(response.data.id).toBe(customerId);
        expect(response.data.name).toBe('Immediate Test');
    });

    it('should have matching created_at and updated_at for new records', async () => {
        const response = await tenant.httpClient.get(`/api/data/customers/${recordId}?stat=true`);

        expectSuccess(response);
        // For records that haven't been updated, these should match
        expect(response.data.created_at).toBe(response.data.updated_at);
    });
});
