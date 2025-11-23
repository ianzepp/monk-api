import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * DELETE /api/describe/:model - Delete Model
 *
 * Tests model soft deletion. The model is marked as trashed but metadata
 * is retained. The PostgreSQL table is dropped.
 */

describe('DELETE /api/describe/:model - Delete Model', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('model-delete');
    });

    it('should delete model successfully', async () => {
        // Create model to delete
        await tenant.httpClient.post('/api/describe/test_deletable', {});

        // Delete it
        const response = await tenant.httpClient.delete('/api/describe/test_deletable');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.model_name).toBe('test_deletable');
    });

    it('should return 404 for non-existent model', async () => {
        const response = await tenant.httpClient.delete('/api/describe/nonexistent_model');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    it('should protect system models from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/models');

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should return 404 when deleting already deleted model', async () => {
        // Create and delete model
        await tenant.httpClient.post('/api/describe/test_twice_deleted', {});
        await tenant.httpClient.delete('/api/describe/test_twice_deleted');

        // Try to delete again
        const response = await tenant.httpClient.delete('/api/describe/test_twice_deleted');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    // TODO: Soft delete keeps model_name, preventing reuse of deleted names
    // Need to restore via Data API or use different name
    it.skip('should allow creating new model with same name after deletion', async () => {
        // Create, delete, then recreate
        await tenant.httpClient.post('/api/describe/test_reusable', {});
        await tenant.httpClient.delete('/api/describe/test_reusable');

        const response = await tenant.httpClient.post('/api/describe/test_reusable', {
            description: 'Recreated after deletion',
        });

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_reusable');
        expect(response.data.description).toBe('Recreated after deletion');
    });

    it('should delete model with fields', async () => {
        // Create model with fields
        await tenant.httpClient.post('/api/describe/test_with_fields', {});
        await tenant.httpClient.post('/api/describe/test_with_fields/fields/name', {
            field_name: 'name',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/test_with_fields/fields/email', {
            field_name: 'email',
            type: 'text',
        });

        // Delete model
        const response = await tenant.httpClient.delete('/api/describe/test_with_fields');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_with_fields');
    });

    it('should delete model with protection flags', async () => {
        // Create model with flags
        await tenant.httpClient.post('/api/describe/test_protected_delete', {
            sudo: true,
            frozen: true,
        });

        // Should still be deletable
        const response = await tenant.httpClient.delete('/api/describe/test_protected_delete');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_protected_delete');
    });

    it('should return minimal response with model_name only', async () => {
        await tenant.httpClient.post('/api/describe/test_response_format', {});

        const response = await tenant.httpClient.delete('/api/describe/test_response_format');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_response_format');

        // Should not include system fields in Describe API
        expect(response.data.id).toBeUndefined();
        expect(response.data.created_at).toBeUndefined();
        expect(response.data.trashed_at).toBeUndefined();
    });

    it('should delete multiple models independently', async () => {
        // Create multiple models
        await tenant.httpClient.post('/api/describe/test_multi_1', {});
        await tenant.httpClient.post('/api/describe/test_multi_2', {});
        await tenant.httpClient.post('/api/describe/test_multi_3', {});

        // Delete them
        const response1 = await tenant.httpClient.delete('/api/describe/test_multi_1');
        const response2 = await tenant.httpClient.delete('/api/describe/test_multi_2');
        const response3 = await tenant.httpClient.delete('/api/describe/test_multi_3');

        expectSuccess(response1);
        expectSuccess(response2);
        expectSuccess(response3);
        expect(response1.data.model_name).toBe('test_multi_1');
        expect(response2.data.model_name).toBe('test_multi_2');
        expect(response3.data.model_name).toBe('test_multi_3');
    });

    it('should delete model with all metadata fields', async () => {
        // Create model with full metadata
        await tenant.httpClient.post('/api/describe/test_full_metadata', {
            status: 'active',
            description: 'Full metadata test',
            sudo: true,
            frozen: false,
            immutable: true,
        });

        const response = await tenant.httpClient.delete('/api/describe/test_full_metadata');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_full_metadata');
    });

    it('should not be retrievable after deletion', async () => {
        // Create and delete
        await tenant.httpClient.post('/api/describe/test_no_retrieve', {});
        await tenant.httpClient.delete('/api/describe/test_no_retrieve');

        // Try to retrieve
        const getResponse = await tenant.httpClient.get('/api/describe/test_no_retrieve');

        expect(getResponse.success).toBe(false);
        expect(getResponse.error_code).toBe('MODEL_NOT_FOUND');
    });
});
