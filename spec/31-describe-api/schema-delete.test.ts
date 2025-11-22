import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * DELETE /api/describe/:schema - Delete Schema
 *
 * Tests schema soft deletion. The schema is marked as trashed but metadata
 * is retained. The PostgreSQL table is dropped.
 */

describe('DELETE /api/describe/:schema - Delete Schema', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('schema-delete');
    });

    it('should delete schema successfully', async () => {
        // Create schema to delete
        await tenant.httpClient.post('/api/describe/test_deletable', {});

        // Delete it
        const response = await tenant.httpClient.delete('/api/describe/test_deletable');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.schema_name).toBe('test_deletable');
    });

    it('should return 404 for non-existent schema', async () => {
        const response = await tenant.httpClient.delete('/api/describe/nonexistent_schema');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });

    it('should protect system schemas from deletion', async () => {
        const response = await tenant.httpClient.delete('/api/describe/schemas');

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should return 404 when deleting already deleted schema', async () => {
        // Create and delete schema
        await tenant.httpClient.post('/api/describe/test_twice_deleted', {});
        await tenant.httpClient.delete('/api/describe/test_twice_deleted');

        // Try to delete again
        const response = await tenant.httpClient.delete('/api/describe/test_twice_deleted');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });

    // TODO: Soft delete keeps schema_name, preventing reuse of deleted names
    // Need to restore via Data API or use different name
    it.skip('should allow creating new schema with same name after deletion', async () => {
        // Create, delete, then recreate
        await tenant.httpClient.post('/api/describe/test_reusable', {});
        await tenant.httpClient.delete('/api/describe/test_reusable');

        const response = await tenant.httpClient.post('/api/describe/test_reusable', {
            description: 'Recreated after deletion',
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_reusable');
        expect(response.data.description).toBe('Recreated after deletion');
    });

    it('should delete schema with columns', async () => {
        // Create schema with columns
        await tenant.httpClient.post('/api/describe/test_with_columns', {});
        await tenant.httpClient.post('/api/describe/test_with_columns/columns/name', {
            column_name: 'name',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/test_with_columns/columns/email', {
            column_name: 'email',
            type: 'text',
        });

        // Delete schema
        const response = await tenant.httpClient.delete('/api/describe/test_with_columns');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_with_columns');
    });

    it('should delete schema with protection flags', async () => {
        // Create schema with flags
        await tenant.httpClient.post('/api/describe/test_protected_delete', {
            sudo: true,
            frozen: true,
        });

        // Should still be deletable
        const response = await tenant.httpClient.delete('/api/describe/test_protected_delete');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_protected_delete');
    });

    it('should return minimal response with schema_name only', async () => {
        await tenant.httpClient.post('/api/describe/test_response_format', {});

        const response = await tenant.httpClient.delete('/api/describe/test_response_format');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_response_format');

        // Should not include system fields in Describe API
        expect(response.data.id).toBeUndefined();
        expect(response.data.created_at).toBeUndefined();
        expect(response.data.trashed_at).toBeUndefined();
    });

    it('should delete multiple schemas independently', async () => {
        // Create multiple schemas
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
        expect(response1.data.schema_name).toBe('test_multi_1');
        expect(response2.data.schema_name).toBe('test_multi_2');
        expect(response3.data.schema_name).toBe('test_multi_3');
    });

    it('should delete schema with all metadata fields', async () => {
        // Create schema with full metadata
        await tenant.httpClient.post('/api/describe/test_full_metadata', {
            status: 'active',
            description: 'Full metadata test',
            sudo: true,
            frozen: false,
            immutable: true,
        });

        const response = await tenant.httpClient.delete('/api/describe/test_full_metadata');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_full_metadata');
    });

    it('should not be retrievable after deletion', async () => {
        // Create and delete
        await tenant.httpClient.post('/api/describe/test_no_retrieve', {});
        await tenant.httpClient.delete('/api/describe/test_no_retrieve');

        // Try to retrieve
        const getResponse = await tenant.httpClient.get('/api/describe/test_no_retrieve');

        expect(getResponse.success).toBe(false);
        expect(getResponse.error_code).toBe('SCHEMA_NOT_FOUND');
    });
});
