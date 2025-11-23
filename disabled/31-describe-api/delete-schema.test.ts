import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * DELETE /api/describe/:model - Delete Model
 *
 * Tests soft-delete of model definitions. Models are marked as trashed
 * and can potentially be restored. System models cannot be deleted.
 */

describe('DELETE /api/describe/:model - Delete Model', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('delete-model');
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should soft-delete a model', async () => {
        // Create model
        await tenant.httpClient.post('/api/describe/deletable', {
            model_name: 'deletable'
        });

        // Delete it
        const response = await tenant.httpClient.delete('/api/describe/deletable');

        expectSuccess(response);
        expect(response.data.model_name).toBe('deletable');
    });

    it('should remove deleted model from listing', async () => {
        // Create model
        await tenant.httpClient.post('/api/describe/test_removal', {
            model_name: 'test_removal'
        });

        // Verify it's listed
        let listResponse = await tenant.httpClient.get('/api/describe');
        expect(listResponse.data).toContain('test_removal');

        // Delete it
        await tenant.httpClient.delete('/api/describe/test_removal');

        // Verify it's not listed
        listResponse = await tenant.httpClient.get('/api/describe');
        expect(listResponse.data).not.toContain('test_removal');
    });

    it('should prevent retrieval of deleted model', async () => {
        // Create and delete model
        await tenant.httpClient.post('/api/describe/deleted_model', {
            model_name: 'deleted_model'
        });

        await tenant.httpClient.delete('/api/describe/deleted_model');

        // Try to retrieve deleted model
        const response = await tenant.httpClient.get('/api/describe/deleted_model');

        expectError(response);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    it('should prevent updating deleted model', async () => {
        // Create and delete model
        await tenant.httpClient.post('/api/describe/update_deleted', {
            model_name: 'update_deleted'
        });

        await tenant.httpClient.delete('/api/describe/update_deleted');

        // Try to update deleted model
        const response = await tenant.httpClient.put('/api/describe/update_deleted', {
            status: 'active'
        });

        expectError(response);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    it('should return 404 for already deleted model', async () => {
        // Create and delete model
        await tenant.httpClient.post('/api/describe/double_delete', {
            model_name: 'double_delete'
        });

        await tenant.httpClient.delete('/api/describe/double_delete');

        // Try to delete again
        const response = await tenant.httpClient.delete('/api/describe/double_delete');

        expectError(response);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    it('should return 404 for non-existent model', async () => {
        const response = await tenant.httpClient.delete('/api/describe/never_existed');

        expectError(response);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    it('should protect system models from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/models');

        expectError(response);
        expect(response.error_code).toBe('MODEL_REQUIRES_SUDO');
    });

    it('should protect users model from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/users');

        expectError(response);
        expect(response.error_code).toBe('MODEL_REQUIRES_SUDO');
    });

    it('should protect fields model from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/fields');

        expectError(response);
        expect(response.error_code).toBe('MODEL_REQUIRES_SUDO');
    });

    it('should allow deleting models with various statuses', async () => {
        // Create models with different statuses
        await tenant.httpClient.post('/api/describe/pending_delete', {
            model_name: 'pending_delete',
            status: 'pending'
        });

        await tenant.httpClient.post('/api/describe/active_delete', {
            model_name: 'active_delete',
            status: 'active'
        });

        // Both should be deletable
        const response1 = await tenant.httpClient.delete('/api/describe/pending_delete');
        expect(response1.success).toBe(true);

        const response2 = await tenant.httpClient.delete('/api/describe/active_delete');
        expect(response2.success).toBe(true);
    });
});
