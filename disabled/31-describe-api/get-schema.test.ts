import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * GET /api/describe/:model - Get Model Details
 *
 * Tests retrieving model metadata (without fields array).
 * Fields must be retrieved separately via field endpoints.
 */

describe('GET /api/describe/:model - Get Model Details', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('get-model');

        // Create test models
        await tenant.httpClient.post('/api/describe/products', {
            model_name: 'products',
            status: 'active',
            description: 'Product catalog'
        });

        await tenant.httpClient.post('/api/describe/protected_model', {
            model_name: 'protected_model',
            status: 'active',
            sudo: true,
            frozen: false,
            immutable: false
        });
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should retrieve model metadata', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.model_name).toBe('products');
    });

    it('should include status field', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expectSuccess(response);
        expect(response.data.status).toBe('active');
    });

    it('should include description field', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expectSuccess(response);
        expect(response.data.description).toBe('Product catalog');
    });

    it('should include protection flags', async () => {
        const response = await tenant.httpClient.get('/api/describe/protected_model');

        expectSuccess(response);
        expect(response.data.sudo).toBe(true);
        expect(response.data.frozen).toBe(false);
        expect(response.data.immutable).toBe(false);
    });

    it('should not include system fields in response', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expectSuccess(response);

        // System fields should be filtered out
        expect(response.data.id).toBeUndefined();
        expect(response.data.created_at).toBeUndefined();
        expect(response.data.updated_at).toBeUndefined();
        expect(response.data.trashed_at).toBeUndefined();
    });

    it('should not include fields array (new architecture)', async () => {
        const response = await tenant.httpClient.get('/api/describe/products');

        expectSuccess(response);

        // Fields are not included in model GET response
        expect(response.data.fields).toBeUndefined();
    });

    it('should return 404 for non-existent model', async () => {
        const response = await tenant.httpClient.get('/api/describe/nonexistent');

        expectError(response);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    it('should retrieve system models', async () => {
        const response = await tenant.httpClient.get('/api/describe/models');

        expectSuccess(response);
        expect(response.data.model_name).toBe('models');
        expect(response.data.status).toBe('system');
    });

    it('should not retrieve trashed models', async () => {
        // Create and then delete a model
        await tenant.httpClient.post('/api/describe/temp_model', {
            model_name: 'temp_model'
        });

        await tenant.httpClient.delete('/api/describe/temp_model');

        // Try to retrieve deleted model
        const response = await tenant.httpClient.get('/api/describe/temp_model');

        expectError(response);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });
});
