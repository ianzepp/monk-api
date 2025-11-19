import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';

/**
 * DELETE /api/describe/:schema - Delete Schema
 *
 * Tests soft-delete of schema definitions. Schemas are marked as trashed
 * and can potentially be restored. System schemas cannot be deleted.
 */

describe('DELETE /api/describe/:schema - Delete Schema', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('delete-schema');
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should soft-delete a schema', async () => {
        // Create schema
        await tenant.httpClient.post('/api/describe/deletable', {
            schema_name: 'deletable'
        });

        // Delete it
        const response = await tenant.httpClient.delete('/api/describe/deletable');

        expect(response.success).toBe(true);
        expect(response.data.schema_name).toBe('deletable');
    });

    it('should remove deleted schema from listing', async () => {
        // Create schema
        await tenant.httpClient.post('/api/describe/test_removal', {
            schema_name: 'test_removal'
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

    it('should prevent retrieval of deleted schema', async () => {
        // Create and delete schema
        await tenant.httpClient.post('/api/describe/deleted_schema', {
            schema_name: 'deleted_schema'
        });
        
        await tenant.httpClient.delete('/api/describe/deleted_schema');

        // Try to retrieve deleted schema
        const response = await tenant.httpClient.get('/api/describe/deleted_schema');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });

    it('should prevent updating deleted schema', async () => {
        // Create and delete schema
        await tenant.httpClient.post('/api/describe/update_deleted', {
            schema_name: 'update_deleted'
        });
        
        await tenant.httpClient.delete('/api/describe/update_deleted');

        // Try to update deleted schema
        const response = await tenant.httpClient.put('/api/describe/update_deleted', {
            status: 'active'
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });

    it('should return 404 for already deleted schema', async () => {
        // Create and delete schema
        await tenant.httpClient.post('/api/describe/double_delete', {
            schema_name: 'double_delete'
        });
        
        await tenant.httpClient.delete('/api/describe/double_delete');

        // Try to delete again
        const response = await tenant.httpClient.delete('/api/describe/double_delete');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });

    it('should return 404 for non-existent schema', async () => {
        const response = await tenant.httpClient.delete('/api/describe/never_existed');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });

    it('should protect system schemas from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/schemas');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_PROTECTED');
    });

    it('should protect users schema from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/users');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_PROTECTED');
    });

    it('should protect columns schema from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/columns');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_PROTECTED');
    });

    it('should allow deleting schemas with various statuses', async () => {
        // Create schemas with different statuses
        await tenant.httpClient.post('/api/describe/pending_delete', {
            schema_name: 'pending_delete',
            status: 'pending'
        });
        
        await tenant.httpClient.post('/api/describe/active_delete', {
            schema_name: 'active_delete',
            status: 'active'
        });

        // Both should be deletable
        const response1 = await tenant.httpClient.delete('/api/describe/pending_delete');
        expect(response1.success).toBe(true);

        const response2 = await tenant.httpClient.delete('/api/describe/active_delete');
        expect(response2.success).toBe(true);
    });
});
