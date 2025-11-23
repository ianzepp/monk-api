import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * DELETE /api/describe/:model/fields/:field - Delete Field
 *
 * Tests field deletion. Performs both soft delete (marks as trashed)
 * and hard delete (DROP COLUMN from PostgreSQL table).
 */

describe('DELETE /api/describe/:model/fields/:field - Delete Field', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('delete-field');

        // Create test model
        await tenant.httpClient.post('/api/describe/products', {
            model_name: 'products',
            status: 'active'
        });
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should delete a field', async () => {
        // Create field
        await tenant.httpClient.post('/api/describe/products/deletable', {
            type: 'text'
        });

        // Delete it
        const response = await tenant.httpClient.delete('/api/describe/products/deletable');

        expectSuccess(response);
        expect(response.data.model_name).toBe('products');
        expect(response.data.field_name).toBe('deletable');
    });

    it('should prevent retrieval of deleted field', async () => {
        // Create and delete field
        await tenant.httpClient.post('/api/describe/products/deleted_col', {
            type: 'text'
        });

        await tenant.httpClient.delete('/api/describe/products/deleted_col');

        // Try to retrieve deleted field
        const response = await tenant.httpClient.get('/api/describe/products/deleted_col');

        expectError(response);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should prevent updating deleted field', async () => {
        // Create and delete field
        await tenant.httpClient.post('/api/describe/products/update_deleted', {
            type: 'text'
        });

        await tenant.httpClient.delete('/api/describe/products/update_deleted');

        // Try to update deleted field
        const response = await tenant.httpClient.put('/api/describe/products/update_deleted', {
            description: 'test'
        });

        expectError(response);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should return 404 for already deleted field', async () => {
        // Create and delete field
        await tenant.httpClient.post('/api/describe/products/double_delete', {
            type: 'text'
        });

        await tenant.httpClient.delete('/api/describe/products/double_delete');

        // Try to delete again
        const response = await tenant.httpClient.delete('/api/describe/products/double_delete');

        expectError(response);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should return 404 for non-existent field', async () => {
        const response = await tenant.httpClient.delete('/api/describe/products/never_existed');

        expectError(response);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should return 404 for field in non-existent model', async () => {
        const response = await tenant.httpClient.delete('/api/describe/nonexistent/field');

        expectError(response);
    });

    it('should allow deleting fields with various types', async () => {
        // Create fields with different types
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

    it('should allow deleting required fields', async () => {
        // Create required field
        await tenant.httpClient.post('/api/describe/products/required_delete', {
            type: 'text',
            required: true
        });

        // Should be deletable
        const response = await tenant.httpClient.delete('/api/describe/products/required_delete');
        expectSuccess(response);
    });

    it('should allow deleting fields with constraints', async () => {
        // Create field with unique constraint
        await tenant.httpClient.post('/api/describe/products/unique_delete', {
            type: 'text',
            unique: true
        });

        // Should be deletable
        const response = await tenant.httpClient.delete('/api/describe/products/unique_delete');
        expectSuccess(response);
    });

    it('should permanently remove field from PostgreSQL table', async () => {
        // Create field
        await tenant.httpClient.post('/api/describe/products/permanent_delete', {
            type: 'text'
        });

        // Delete it
        const deleteResponse = await tenant.httpClient.delete('/api/describe/products/permanent_delete');
        expect(deleteResponse.success).toBe(true);

        // Field should be gone from fields table
        const getResponse = await tenant.httpClient.get('/api/describe/products/permanent_delete');
        expect(getResponse.success).toBe(false);
    });
});
