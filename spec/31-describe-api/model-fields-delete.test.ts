import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * DELETE /api/describe/:model/fields/:field - Delete Field
 *
 * Tests field soft deletion. The field metadata is marked as trashed and
 * the PostgreSQL field is dropped.
 */

describe('DELETE /api/describe/:model/fields/:field - Delete Field', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('model-fields-delete');

        // Create test model
        await tenant.httpClient.post('/api/describe/test_products', {});
    });

    it('should delete field successfully', async () => {
        // Create field to delete
        await tenant.httpClient.post('/api/describe/test_products/fields/deletable', {
            field_name: 'deletable',
            type: 'text',
        });

        // Delete it
        const response = await tenant.httpClient.delete('/api/describe/test_products/fields/deletable');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.model_name).toBe('test_products');
        expect(response.data.field_name).toBe('deletable');
    });

    it('should return 404 for non-existent field', async () => {
        const response = await tenant.httpClient.delete('/api/describe/test_products/fields/nonexistent');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should return error for field in non-existent model', async () => {
        const response = await tenant.httpClient.delete('/api/describe/nonexistent_model/fields/some_field');

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should protect system model fields from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/models/fields/model_name');

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should return 404 when deleting already deleted field', async () => {
        // Create and delete field
        await tenant.httpClient.post('/api/describe/test_products/fields/twice_deleted', {
            field_name: 'twice_deleted',
            type: 'text',
        });
        await tenant.httpClient.delete('/api/describe/test_products/fields/twice_deleted');

        // Try to delete again
        const response = await tenant.httpClient.delete('/api/describe/test_products/fields/twice_deleted');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should delete field with constraints', async () => {
        // Create field with constraints
        await tenant.httpClient.post('/api/describe/test_products/fields/constrained', {
            field_name: 'constrained',
            type: 'text',
            required: true,
            unique: true,
            pattern: '^[A-Z]+$',
        });

        const response = await tenant.httpClient.delete('/api/describe/test_products/fields/constrained');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_products');
        expect(response.data.field_name).toBe('constrained');
    });

    it('should delete field with index', async () => {
        // Create field with index
        await tenant.httpClient.post('/api/describe/test_products/fields/indexed', {
            field_name: 'indexed',
            type: 'text',
            index: true,
        });

        const response = await tenant.httpClient.delete('/api/describe/test_products/fields/indexed');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_products');
        expect(response.data.field_name).toBe('indexed');
    });

    it('should delete searchable field', async () => {
        // Create searchable field
        await tenant.httpClient.post('/api/describe/test_products/fields/searchable', {
            field_name: 'searchable',
            type: 'text',
            searchable: true,
        });

        const response = await tenant.httpClient.delete('/api/describe/test_products/fields/searchable');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_products');
        expect(response.data.field_name).toBe('searchable');
    });

    it('should delete multiple fields independently', async () => {
        // Create multiple fields
        await tenant.httpClient.post('/api/describe/test_products/fields/col1', {
            field_name: 'col1',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/test_products/fields/col2', {
            field_name: 'col2',
            type: 'integer',
        });
        await tenant.httpClient.post('/api/describe/test_products/fields/col3', {
            field_name: 'col3',
            type: 'boolean',
        });

        // Delete them
        const response1 = await tenant.httpClient.delete('/api/describe/test_products/fields/col1');
        const response2 = await tenant.httpClient.delete('/api/describe/test_products/fields/col2');
        const response3 = await tenant.httpClient.delete('/api/describe/test_products/fields/col3');

        expectSuccess(response1);
        expectSuccess(response2);
        expectSuccess(response3);
        expect(response1.data.field_name).toBe('col1');
        expect(response2.data.field_name).toBe('col2');
        expect(response3.data.field_name).toBe('col3');
    });

    it('should not be retrievable after deletion', async () => {
        // Create and delete
        await tenant.httpClient.post('/api/describe/test_products/fields/no_retrieve', {
            field_name: 'no_retrieve',
            type: 'text',
        });
        await tenant.httpClient.delete('/api/describe/test_products/fields/no_retrieve');

        // Try to retrieve
        const getResponse = await tenant.httpClient.get('/api/describe/test_products/fields/no_retrieve');

        expect(getResponse.success).toBe(false);
        expect(getResponse.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should return minimal response format', async () => {
        await tenant.httpClient.post('/api/describe/test_products/fields/response_test', {
            field_name: 'response_test',
            type: 'text',
            description: 'Test response format',
        });

        const response = await tenant.httpClient.delete('/api/describe/test_products/fields/response_test');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_products');
        expect(response.data.field_name).toBe('response_test');

        // Should not include system fields in Describe API
        expect(response.data.id).toBeUndefined();
        expect(response.data.created_at).toBeUndefined();
        expect(response.data.trashed_at).toBeUndefined();
    });
});
