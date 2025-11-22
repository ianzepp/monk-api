import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * DELETE /api/describe/:schema/columns/:column - Delete Column
 *
 * Tests column soft deletion. The column metadata is marked as trashed and
 * the PostgreSQL column is dropped.
 */

describe('DELETE /api/describe/:schema/columns/:column - Delete Column', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('schema-columns-delete');

        // Create test schema
        await tenant.httpClient.post('/api/describe/test_products', {});
    });

    it('should delete column successfully', async () => {
        // Create column to delete
        await tenant.httpClient.post('/api/describe/test_products/columns/deletable', {
            column_name: 'deletable',
            type: 'text',
        });

        // Delete it
        const response = await tenant.httpClient.delete('/api/describe/test_products/columns/deletable');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.schema_name).toBe('test_products');
        expect(response.data.column_name).toBe('deletable');
    });

    it('should return 404 for non-existent column', async () => {
        const response = await tenant.httpClient.delete('/api/describe/test_products/columns/nonexistent');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should return error for column in non-existent schema', async () => {
        const response = await tenant.httpClient.delete('/api/describe/nonexistent_schema/columns/some_column');

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should protect system schema columns from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/schemas/columns/schema_name');

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should return 404 when deleting already deleted column', async () => {
        // Create and delete column
        await tenant.httpClient.post('/api/describe/test_products/columns/twice_deleted', {
            column_name: 'twice_deleted',
            type: 'text',
        });
        await tenant.httpClient.delete('/api/describe/test_products/columns/twice_deleted');

        // Try to delete again
        const response = await tenant.httpClient.delete('/api/describe/test_products/columns/twice_deleted');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should delete column with constraints', async () => {
        // Create column with constraints
        await tenant.httpClient.post('/api/describe/test_products/columns/constrained', {
            column_name: 'constrained',
            type: 'text',
            required: true,
            unique: true,
            pattern: '^[A-Z]+$',
        });

        const response = await tenant.httpClient.delete('/api/describe/test_products/columns/constrained');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_products');
        expect(response.data.column_name).toBe('constrained');
    });

    it('should delete column with index', async () => {
        // Create column with index
        await tenant.httpClient.post('/api/describe/test_products/columns/indexed', {
            column_name: 'indexed',
            type: 'text',
            index: true,
        });

        const response = await tenant.httpClient.delete('/api/describe/test_products/columns/indexed');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_products');
        expect(response.data.column_name).toBe('indexed');
    });

    it('should delete searchable column', async () => {
        // Create searchable column
        await tenant.httpClient.post('/api/describe/test_products/columns/searchable', {
            column_name: 'searchable',
            type: 'text',
            searchable: true,
        });

        const response = await tenant.httpClient.delete('/api/describe/test_products/columns/searchable');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_products');
        expect(response.data.column_name).toBe('searchable');
    });

    it('should delete multiple columns independently', async () => {
        // Create multiple columns
        await tenant.httpClient.post('/api/describe/test_products/columns/col1', {
            column_name: 'col1',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/test_products/columns/col2', {
            column_name: 'col2',
            type: 'integer',
        });
        await tenant.httpClient.post('/api/describe/test_products/columns/col3', {
            column_name: 'col3',
            type: 'boolean',
        });

        // Delete them
        const response1 = await tenant.httpClient.delete('/api/describe/test_products/columns/col1');
        const response2 = await tenant.httpClient.delete('/api/describe/test_products/columns/col2');
        const response3 = await tenant.httpClient.delete('/api/describe/test_products/columns/col3');

        expectSuccess(response1);
        expectSuccess(response2);
        expectSuccess(response3);
        expect(response1.data.column_name).toBe('col1');
        expect(response2.data.column_name).toBe('col2');
        expect(response3.data.column_name).toBe('col3');
    });

    it('should not be retrievable after deletion', async () => {
        // Create and delete
        await tenant.httpClient.post('/api/describe/test_products/columns/no_retrieve', {
            column_name: 'no_retrieve',
            type: 'text',
        });
        await tenant.httpClient.delete('/api/describe/test_products/columns/no_retrieve');

        // Try to retrieve
        const getResponse = await tenant.httpClient.get('/api/describe/test_products/columns/no_retrieve');

        expect(getResponse.success).toBe(false);
        expect(getResponse.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should return minimal response format', async () => {
        await tenant.httpClient.post('/api/describe/test_products/columns/response_test', {
            column_name: 'response_test',
            type: 'text',
            description: 'Test response format',
        });

        const response = await tenant.httpClient.delete('/api/describe/test_products/columns/response_test');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_products');
        expect(response.data.column_name).toBe('response_test');

        // Should not include system fields in Describe API
        expect(response.data.id).toBeUndefined();
        expect(response.data.created_at).toBeUndefined();
        expect(response.data.trashed_at).toBeUndefined();
    });
});
