import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * POST /api/describe/:model - Create Model
 *
 * Tests model creation endpoint. Creates model metadata only (no fields).
 * Fields are added separately via POST /api/describe/:model/fields/:field.
 */

describe('POST /api/describe/:model - Create Model', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('create-model');
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should create model with minimal fields', async () => {
        const response = await tenant.httpClient.post('/api/describe/products', {
            model_name: 'products',
        });

        expectSuccess(response, 'Failed to create model');
        expect(response.data).toBeDefined();
        expect(response.data.model_name).toBe('products');
    });

    it('should create model with status', async () => {
        const response = await tenant.httpClient.post('/api/describe/orders', {
            model_name: 'orders',
            status: 'active'
        });

        expectSuccess(response, 'Failed to create model');
        expect(response.data.model_name).toBe('orders');
        expect(response.data.status).toBe('active');
    });

    it('should create model with description', async () => {
        const response = await tenant.httpClient.post('/api/describe/customers', {
            model_name: 'customers',
            status: 'active',
            description: 'Customer information'
        });

        expectSuccess(response, 'Failed to create model');
        expect(response.data.model_name).toBe('customers');
        expect(response.data.description).toBe('Customer information');
    });

    it('should create model with sudo protection', async () => {
        const response = await tenant.httpClient.post('/api/describe/sensitive_data', {
            model_name: 'sensitive_data',
            status: 'active',
            sudo: true
        });

        expectSuccess(response, 'Failed to create model');
        expect(response.data.model_name).toBe('sensitive_data');
        expect(response.data.sudo).toBe(true);
    });

    it('should create model with frozen flag', async () => {
        const response = await tenant.httpClient.post('/api/describe/frozen_data', {
            model_name: 'frozen_data',
            status: 'active',
            frozen: true
        });

        expectSuccess(response, 'Failed to create model');
        expect(response.data.model_name).toBe('frozen_data');
        expect(response.data.frozen).toBe(true);
    });

    it('should create model with immutable flag', async () => {
        const response = await tenant.httpClient.post('/api/describe/audit_log', {
            model_name: 'audit_log',
            status: 'active',
            immutable: true
        });

        expectSuccess(response, 'Failed to create model');
        expect(response.data.model_name).toBe('audit_log');
        expect(response.data.immutable).toBe(true);
    });

    it('should reject duplicate model names', async () => {
        // Create first model
        await tenant.httpClient.post('/api/describe/unique_test', {
            model_name: 'unique_test'
        });

        // Try to create duplicate
        const response = await tenant.httpClient.post('/api/describe/unique_test', {
            model_name: 'unique_test'
        });

        expectError(response);
    });

    it('should reject mismatched model names (URL vs body)', async () => {
        const response = await tenant.httpClient.post('/api/describe/url_name', {
            model_name: 'body_name'
        });

        // Should fail without ?force=true
        expectError(response);
    });

    it('should allow mismatched names with force parameter', async () => {
        const response = await tenant.httpClient.post('/api/describe/url_name2?force=true', {
            model_name: 'body_name2'
        });

        // Should succeed with force, using body name
        expectSuccess(response, 'Failed to create model');
        expect(response.data.model_name).toBe('body_name2');
    });

    it('should not accept fields array (old pattern)', async () => {
        const response = await tenant.httpClient.post('/api/describe/with_fields', {
            model_name: 'with_fields',
            fields: [
                { field_name: 'name', type: 'text' }
            ]
        });

        // Should fail - fields not allowed in model creation
        expectError(response);
    });

    it('should create model and it appears in list', async () => {
        // Create model
        const createResponse = await tenant.httpClient.post('/api/describe/listed_model', {
            model_name: 'listed_model'
        });

        expectSuccess(createResponse, 'Failed to create model');

        // Verify it appears in model list
        const listResponse = await tenant.httpClient.get('/api/describe');
        expect(listResponse.success).toBe(true);
        expect(listResponse.data).toContain('listed_model');
    });
});
