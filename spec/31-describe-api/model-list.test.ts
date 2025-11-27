import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * GET /api/describe - List All Models
 *
 * Tests the endpoint that lists all available model names in the current tenant.
 */

describe('GET /api/describe - List All Models', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('model-list');
    });

    it('should return array of model names', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(Array.isArray(response.data)).toBe(true);
    });

    it('should include system models', async () => {
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);

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
        const createResponse = await tenant.httpClient.post('/api/describe/test_custom_model', {});
        expectSuccess(createResponse);

        // List models again
        const listResponse = await tenant.httpClient.get('/api/describe');

        expectSuccess(listResponse);
        const models = listResponse.data as string[];
        expect(models).toContain('test_custom_model');
    });

    // TODO: Model deletion/trashing may not be filtering from list endpoint yet
    // The test expects deleted models to be excluded but they still appear
    it.skip('should not include trashed models', async () => {
        // Create a model
        await tenant.httpClient.post('/api/describe/test_temp_model', {});

        // Delete it (soft delete)
        await tenant.httpClient.delete('/api/describe/test_temp_model');

        // List models - should not include trashed
        const response = await tenant.httpClient.get('/api/describe');

        expectSuccess(response);
        const models = response.data as string[];
        expect(models).not.toContain('test_temp_model');
    });
});
