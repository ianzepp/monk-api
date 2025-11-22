import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * DELETE /api/describe/:schema/columns/:column - Delete Column
 *
 * Tests column deletion. Performs both soft delete (marks as trashed)
 * and hard delete (DROP COLUMN from PostgreSQL table).
 */

describe('DELETE /api/describe/:schema/columns/:column - Delete Column', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('delete-column');

        // Create test schema
        await tenant.httpClient.post('/api/describe/products', {
            schema_name: 'products',
            status: 'active'
        });
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should delete a column', async () => {
        // Create column
        await tenant.httpClient.post('/api/describe/products/deletable', {
            type: 'text'
        });

        // Delete it
        const response = await tenant.httpClient.delete('/api/describe/products/deletable');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('products');
        expect(response.data.column_name).toBe('deletable');
    });

    it('should prevent retrieval of deleted column', async () => {
        // Create and delete column
        await tenant.httpClient.post('/api/describe/products/deleted_col', {
            type: 'text'
        });

        await tenant.httpClient.delete('/api/describe/products/deleted_col');

        // Try to retrieve deleted column
        const response = await tenant.httpClient.get('/api/describe/products/deleted_col');

        expectError(response);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should prevent updating deleted column', async () => {
        // Create and delete column
        await tenant.httpClient.post('/api/describe/products/update_deleted', {
            type: 'text'
        });

        await tenant.httpClient.delete('/api/describe/products/update_deleted');

        // Try to update deleted column
        const response = await tenant.httpClient.put('/api/describe/products/update_deleted', {
            description: 'test'
        });

        expectError(response);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should return 404 for already deleted column', async () => {
        // Create and delete column
        await tenant.httpClient.post('/api/describe/products/double_delete', {
            type: 'text'
        });

        await tenant.httpClient.delete('/api/describe/products/double_delete');

        // Try to delete again
        const response = await tenant.httpClient.delete('/api/describe/products/double_delete');

        expectError(response);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should return 404 for non-existent column', async () => {
        const response = await tenant.httpClient.delete('/api/describe/products/never_existed');

        expectError(response);
        expect(response.error_code).toBe('COLUMN_NOT_FOUND');
    });

    it('should return 404 for column in non-existent schema', async () => {
        const response = await tenant.httpClient.delete('/api/describe/nonexistent/column');

        expectError(response);
    });

    it('should allow deleting columns with various types', async () => {
        // Create columns with different types
        await tenant.httpClient.post('/api/describe/products/text_delete', {
            type: 'text'
        });

        await tenant.httpClient.post('/api/describe/products/int_delete', {
            type: 'integer'
        });

        await tenant.httpClient.post('/api/describe/products/json_delete', {
            type: 'jsonb'
        });

        // All should be deletable
        const response1 = await tenant.httpClient.delete('/api/describe/products/text_delete');
        expect(response1.success).toBe(true);

        const response2 = await tenant.httpClient.delete('/api/describe/products/int_delete');
        expect(response2.success).toBe(true);

        const response3 = await tenant.httpClient.delete('/api/describe/products/json_delete');
        expect(response3.success).toBe(true);
    });

    it('should allow deleting required columns', async () => {
        // Create required column
        await tenant.httpClient.post('/api/describe/products/required_delete', {
            type: 'text',
            required: true
        });

        // Should be deletable
        const response = await tenant.httpClient.delete('/api/describe/products/required_delete');
        expectSuccess(response);
    });

    it('should allow deleting columns with constraints', async () => {
        // Create column with unique constraint
        await tenant.httpClient.post('/api/describe/products/unique_delete', {
            type: 'text',
            unique: true
        });

        // Should be deletable
        const response = await tenant.httpClient.delete('/api/describe/products/unique_delete');
        expectSuccess(response);
    });

    it('should permanently remove column from PostgreSQL table', async () => {
        // Create column
        await tenant.httpClient.post('/api/describe/products/permanent_delete', {
            type: 'text'
        });

        // Delete it
        const deleteResponse = await tenant.httpClient.delete('/api/describe/products/permanent_delete');
        expect(deleteResponse.success).toBe(true);

        // Column should be gone from columns table
        const getResponse = await tenant.httpClient.get('/api/describe/products/permanent_delete');
        expect(getResponse.success).toBe(false);
    });
});
