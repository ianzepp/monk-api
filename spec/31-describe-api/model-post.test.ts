import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * POST /api/describe/:model - Create Model
 *
 * Tests model creation endpoint. Validates model creation with various
 * metadata and protection settings.
 */

describe('POST /api/describe/:model - Create Model', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('model-post');
    });

    it('should create model with minimal fields', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_minimal', {});

        expectSuccess(response);
        expect(response.data).toBeDefined();
        expect(response.data.model_name).toBe('test_minimal');
    });

    it('should create model with description', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_description', {
            description: 'Test model with description',
        });

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_description');
        expect(response.data.description).toBe('Test model with description');
    });

    it('should create model with active status', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_active', {
            status: 'active',
        });

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_active');
        expect(response.data.status).toBe('active');
    });

    it('should create model with sudo protection', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_sudo', {
            sudo: true,
        });

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_sudo');
        expect(response.data.sudo).toBe(true);
    });

    it('should create model with frozen protection', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_frozen', {
            frozen: true,
        });

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_frozen');
        expect(response.data.frozen).toBe(true);
    });

    it('should create model with immutable flag', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_immutable', {
            immutable: true,
        });

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_immutable');
        expect(response.data.immutable).toBe(true);
    });

    it('should create model with all fields', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_complete', {
            status: 'active',
            description: 'Complete test model',
            sudo: true,
            frozen: false,
            immutable: false,
        });

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_complete');
        expect(response.data.status).toBe('active');
        expect(response.data.description).toBe('Complete test model');
        expect(response.data.sudo).toBe(true);
        expect(response.data.frozen).toBe(false);
        expect(response.data.immutable).toBe(false);
    });

    it('should reject model name mismatch without force', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_mismatch_url', {
            model_name: 'test_mismatch_body',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('BAD_REQUEST');
    });

    it('should allow model name mismatch with force parameter', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_force_url?force=true', {
            model_name: 'test_force_body',
        });

        expectSuccess(response);
        expect(response.data.model_name).toBe('test_force_body');
    });

    it('should reject duplicate model name', async () => {
        const modelName = 'test_duplicate';

        // Create model first time
        const firstResponse = await tenant.httpClient.post(`/api/describe/${modelName}`, {});

        expectSuccess(firstResponse);

        // Try to create same model again
        const secondResponse = await tenant.httpClient.post(`/api/describe/${modelName}`, {});

        expect(secondResponse.success).toBe(false);
        expect(secondResponse.error_code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid model name with special characters', async () => {
        const response = await tenant.httpClient.post('/api/describe/test-invalid-name', {});

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid model name starting with number', async () => {
        const response = await tenant.httpClient.post('/api/describe/123invalid', {});

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('VALIDATION_ERROR');
    });
});
