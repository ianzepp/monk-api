import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * GET /api/describe - List All Models
 *
 * Tests the endpoint that lists all available model names in the current tenant.
 * Uses 'system' template which includes system models.
 */

describe('GET /api/describe - List All Models', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('list-models');
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should return array of model names', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(Array.isArray(response.data)).toBe(true);
    });

    it('should include system models in default template', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);

        // Default template should have system models
        const models = response.data as string[];
        expect(models).toContain('models');
        expect(models).toContain('fields');
        expect(models).toContain('users');
    });

    it('should return string array (model names only)', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);

        const models = response.data as string[];
        expect(models.length).toBeGreaterThan(0);

        // Each item should be a string (model name)
        models.forEach(model => {
            expect(typeof model).toBe('string');
        });
    });

    it('should include custom models after creation', async () => {
        // Create a custom model
        const createResponse = await tenant.httpClient.post('/api/describe/products', {
            model_name: 'products',
            status: 'active'
        });
        expect(createResponse.success).toBe(true);

        // List models again
        const listResponse = await tenant.httpClient.get('/api/describe');

        expect(listResponse.success).toBe(true);
        const models = listResponse.data as string[];
        expect(models).toContain('products');
    });

    it('should not include trashed models', async () => {
        // Create a model
        await tenant.httpClient.post('/api/describe/temp_model', {
            model_name: 'temp_model',
            status: 'active'
        });

        // Delete it (soft delete)
        await tenant.httpClient.delete('/api/describe/temp_model');

        // List models - should not include trashed
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);
        const models = response.data as string[];
        expect(models).not.toContain('temp_model');
    });
});
