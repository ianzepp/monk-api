import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectError, expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * PUT /api/describe/:model - Update Model
 *
 * Tests model metadata updates. Does not update fields - use field endpoints for that.
 */

describe('PUT /api/describe/:model - Update Model', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('model-put');

        // Create test model
        await tenant.httpClient.post('/api/describe/test_products', {
            status: 'pending',
        });
    });

    it('should update model status', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products', {
            status: 'active',
        });

        expectSuccess(response);
        expect(response.data.status).toBe('active');
    });

    it('should update sudo protection flag', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products', {
            sudo: true,
        });

        expectSuccess(response);
        expect(response.data.sudo).toBe(true);
    });

    it('should update frozen flag', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products', {
            frozen: true,
        });

        expectSuccess(response);
        expect(response.data.frozen).toBe(true);
    });

    it('should update immutable flag', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products', {
            immutable: true,
        });

        expectSuccess(response);
        expect(response.data.immutable).toBe(true);
    });

    it('should update description', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products', {
            description: 'Updated product catalog',
        });

        expectSuccess(response);
        expect(response.data.description).toBe('Updated product catalog');
    });

    it('should update multiple fields at once', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products', {
            status: 'active',
            sudo: false,
            frozen: false,
            description: 'Multi-field update',
        });

        expectSuccess(response);
        expect(response.data.status).toBe('active');
        expect(response.data.sudo).toBe(false);
        expect(response.data.frozen).toBe(false);
        expect(response.data.description).toBe('Multi-field update');
    });

    it('should persist updates across GET requests', async () => {
        // Update model
        await tenant.httpClient.put('/api/describe/test_products', {
            status: 'active',
            description: 'Persisted description',
        });

        // Retrieve model
        const getResponse = await tenant.httpClient.get('/api/describe/test_products');

        expect(getResponse.success).toBe(true);
        expect(getResponse.data.status).toBe('active');
        expect(getResponse.data.description).toBe('Persisted description');
    });

    it('should reject empty updates', async () => {
        const response = await tenant.httpClient.put('/api/describe/test_products', {});

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });

    it('should return 404 for non-existent model', async () => {
        const response = await tenant.httpClient.put('/api/describe/nonexistent_model', {
            status: 'active',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('MODEL_NOT_FOUND');
    });

    it('should not allow updating model_name', async () => {
        // Attempt to change model name
        const response = await tenant.httpClient.put('/api/describe/test_products', {
            model_name: 'renamed_products',
            status: 'active',
        });

        // Even if successful, model_name should not change
        if (response.success) {
            const getResponse = await tenant.httpClient.get('/api/describe/test_products');
            expectError(getResponse, 'Model \'test_products\' not found');
        }
    });

    it('should protect system models from updates', async () => {
        const response = await tenant.httpClient.put('/api/describe/models', {
            status: 'active',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBeDefined();
    });
});
