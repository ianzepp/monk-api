import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * DELETE /api/data/:schema/:record - Delete Single Record
 *
 * Tests soft delete functionality with trashed_at timestamps and error handling.
 */

describe('DELETE /api/data/:schema/:record - Delete Single Record', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('data-delete');

        // Create test schema
        await tenant.httpClient.post('/api/describe/products', {});
        await tenant.httpClient.post('/api/describe/products/columns/name', {
            column_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/products/columns/price', {
            column_name: 'price',
            type: 'decimal',
        });
    });

    it('should soft delete record', async () => {
        // Create record
        const createResponse = await tenant.httpClient.post('/api/data/products', [
            { name: 'Product to Delete', price: 19.99 },
        ]);
        const recordId = createResponse.data[0].id;

        // Delete record
        const response = await tenant.httpClient.delete(`/api/data/products/${recordId}`);

        expectSuccess(response);
        expect(response.data.id).toBe(recordId);
        expect(response.data.trashed_at).toBeDefined();
        expect(response.data.trashed_at).not.toBeNull();
    });

    it('should include all fields in delete response', async () => {
        // Create record
        const createResponse = await tenant.httpClient.post('/api/data/products', [
            { name: 'Another Product', price: 29.99 },
        ]);
        const recordId = createResponse.data[0].id;

        // Delete record
        const response = await tenant.httpClient.delete(`/api/data/products/${recordId}`);

        expectSuccess(response);
        expect(response.data.id).toBeDefined();
        expect(response.data.name).toBe('Another Product');
        expect(response.data.price).toBe(29.99);
        expect(response.data.created_at).toBeDefined();
        expect(response.data.updated_at).toBeDefined();
        expect(response.data.trashed_at).toBeDefined();
    });

    it('should have null deleted_at for soft delete', async () => {
        // Create record
        const createResponse = await tenant.httpClient.post('/api/data/products', [
            { name: 'Soft Delete Test', price: 9.99 },
        ]);
        const recordId = createResponse.data[0].id;

        // Delete record
        const response = await tenant.httpClient.delete(`/api/data/products/${recordId}`);

        expectSuccess(response);
        expect(response.data.trashed_at).not.toBeNull();
        expect(response.data.deleted_at).toBeNull();
    });

    it('should set trashed_at to recent timestamp', async () => {
        const beforeDelete = new Date();

        // Create record
        const createResponse = await tenant.httpClient.post('/api/data/products', [
            { name: 'Timestamp Test', price: 14.99 },
        ]);
        const recordId = createResponse.data[0].id;

        // Delete record
        const response = await tenant.httpClient.delete(`/api/data/products/${recordId}`);

        expectSuccess(response);
        const trashedAt = new Date(response.data.trashed_at);
        expect(trashedAt.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime());
        expect(trashedAt.getTime()).toBeLessThanOrEqual(new Date().getTime());
    });

    it('should return 404 for non-existent record', async () => {
        const fakeId = '550e8400-e29b-41d4-a716-446655440000';
        const response = await tenant.httpClient.delete(`/api/data/products/${fakeId}`);

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('RECORD_NOT_FOUND');
    });

    it('should return error for non-existent schema', async () => {
        const fakeId = '550e8400-e29b-41d4-a716-446655440000';
        const response = await tenant.httpClient.delete(`/api/data/nonexistent/${fakeId}`);

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('INTERNAL_ERROR');
    });

    it('should delete multiple records independently', async () => {
        // Create two records
        const createResponse = await tenant.httpClient.post('/api/data/products', [
            { name: 'Product 1', price: 10.00 },
            { name: 'Product 2', price: 20.00 },
        ]);
        const id1 = createResponse.data[0].id;
        const id2 = createResponse.data[1].id;

        // Delete first record
        const response1 = await tenant.httpClient.delete(`/api/data/products/${id1}`);
        expectSuccess(response1);
        expect(response1.data.trashed_at).not.toBeNull();

        // Delete second record
        const response2 = await tenant.httpClient.delete(`/api/data/products/${id2}`);
        expectSuccess(response2);
        expect(response2.data.trashed_at).not.toBeNull();
    });
});
