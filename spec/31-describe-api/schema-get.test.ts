import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe/:schema - Get Schema Details
 *
 * Tests retrieving schema metadata. Uses built-in system schemas
 * (users, schemas, columns) to avoid test pollution.
 */

describe('GET /api/describe/:schema - Get Schema Details', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('schema-get');
    });

    it('should retrieve schema metadata', async () => {
        const response = await tenant.httpClient.get('/api/describe/users');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.schema_name).toBe('users');
    });

    it('should include status field', async () => {
        const response = await tenant.httpClient.get('/api/describe/users');

        expectSuccess(response);
        expect(response.data.status).toBeDefined();
    });

    it('should retrieve system schemas', async () => {
        const response = await tenant.httpClient.get('/api/describe/schemas');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('schemas');
        expect(response.data.status).toBe('system');
    });

    it('should not include system fields in response', async () => {
        const response = await tenant.httpClient.get('/api/describe/users');

        expectSuccess(response);

        // System fields should be filtered out (based on disabled test expectations)
        expect(response.data.id).toBeUndefined();
        expect(response.data.created_at).toBeUndefined();
        expect(response.data.updated_at).toBeUndefined();
        expect(response.data.trashed_at).toBeUndefined();
    });

    it('should not include columns array', async () => {
        const response = await tenant.httpClient.get('/api/describe/users');

        expectSuccess(response);

        // Columns are retrieved separately, not included in schema GET
        expect(response.data.columns).toBeUndefined();
    });

    it('should return 404 for non-existent schema', async () => {
        const response = await tenant.httpClient.get('/api/describe/nonexistent_schema_12345');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NOT_FOUND');
    });

    it('should retrieve columns schema', async () => {
        const response = await tenant.httpClient.get('/api/describe/columns');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('columns');
        expect(response.data.status).toBe('system');
    });

    it('should retrieve schema with protection flags', async () => {
        // Create a test schema with protection flags
        await tenant.httpClient.post('/api/describe/test_protected', {
            sudo: true,
            frozen: false,
            immutable: true,
        });

        const response = await tenant.httpClient.get('/api/describe/test_protected');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_protected');
        expect(response.data.sudo).toBe(true);
        expect(response.data.frozen).toBe(false);
        expect(response.data.immutable).toBe(true);
    });

    it('should retrieve schema with description', async () => {
        // Create a test schema with description
        await tenant.httpClient.post('/api/describe/test_described', {
            description: 'Test schema description',
        });

        const response = await tenant.httpClient.get('/api/describe/test_described');

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_described');
        expect(response.data.description).toBe('Test schema description');
    });
});
