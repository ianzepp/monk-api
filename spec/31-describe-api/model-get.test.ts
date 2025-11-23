import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe/:model - Get Model Details
 *
 * Tests retrieving model metadata. Uses built-in system models
 * (users, models, fields) to avoid test pollution.
 */

describe('GET /api/describe/:model - Get Model Details', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('model-get');
    });

    it('should retrieve model metadata', async () => {
        const response = await tenant.httpClient.get('/api/describe/users');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.model_name).toBe('users');
    });

    it('should include status field', async () => {
        const response = await tenant.httpClient.get('/api/describe/users');

        expectSuccess(response);
        expect(response.data.status).toBeDefined();
    });

    it('should retrieve system models', async () => {
        const response = await tenant.httpClient.get('/api/describe/models');

        expectSuccess(response);
        expect(response.data.model_name).toBe('models');
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

    it('should not include fields array', async () => {
        const response = await tenant.httpClient.get('/api/describe/users');

        expectSuccess(response);

        // Fields are retrieved separately, not included in model GET
        expect(response.data.fields).toBeUndefined();
    });

    it('should return 404 for non-existent model', async () => {
        const response = await tenant.httpClient.get('/api/describe/nonexistent_model_12345');

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    it('should retrieve fields model', async () => {
        const response = await tenant.httpClient.get('/api/describe/fields');

        expectSuccess(response);
        expect(response.data.model_name).toBe('fields');
        expect(response.data.status).toBe('system');
    });

    it('should retrieve model with protection flags', async () => {
        // Create a test model with protection flags
        await tenant.httpClient.post('/api/describe/test_protected', {
            sudo: true,
            frozen: false,
            immutable: true,
        });

        const response = await tenant.httpClient.get('/api/describe/test_protected');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_protected');
        expect(response.data.sudo).toBe(true);
        expect(response.data.frozen).toBe(false);
        expect(response.data.immutable).toBe(true);
    });

    it('should retrieve model with description', async () => {
        // Create a test model with description
        await tenant.httpClient.post('/api/describe/test_described', {
            description: 'Test model description',
        });

        const response = await tenant.httpClient.get('/api/describe/test_described');

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_described');
        expect(response.data.description).toBe('Test model description');
    });
});
