import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * POST /api/describe/:schema - Create Schema
 *
 * Tests schema creation endpoint. Creates schema metadata only (no columns).
 * Columns are added separately via POST /api/describe/:schema/:column.
 */

describe('POST /api/describe/:schema - Create Schema', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('create-schema');
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should create schema with minimal fields', async () => {
        const response = await tenant.httpClient.post('/api/describe/products', {
            schema_name: 'products',
        });

        expectSuccess(response, 'Failed to create schema');
        expect(response.data).toBeDefined();
        expect(response.data.schema_name).toBe('products');
    });

    it('should create schema with status', async () => {
        const response = await tenant.httpClient.post('/api/describe/orders', {
            schema_name: 'orders',
            status: 'active'
        });

        expectSuccess(response, 'Failed to create schema');
        expect(response.data.schema_name).toBe('orders');
        expect(response.data.status).toBe('active');
    });

    it('should create schema with description', async () => {
        const response = await tenant.httpClient.post('/api/describe/customers', {
            schema_name: 'customers',
            status: 'active',
            description: 'Customer information'
        });

        expectSuccess(response, 'Failed to create schema');
        expect(response.data.schema_name).toBe('customers');
        expect(response.data.description).toBe('Customer information');
    });

    it('should create schema with sudo protection', async () => {
        const response = await tenant.httpClient.post('/api/describe/sensitive_data', {
            schema_name: 'sensitive_data',
            status: 'active',
            sudo: true
        });

        expectSuccess(response, 'Failed to create schema');
        expect(response.data.schema_name).toBe('sensitive_data');
        expect(response.data.sudo).toBe(true);
    });

    it('should create schema with frozen flag', async () => {
        const response = await tenant.httpClient.post('/api/describe/frozen_data', {
            schema_name: 'frozen_data',
            status: 'active',
            frozen: true
        });

        expectSuccess(response, 'Failed to create schema');
        expect(response.data.schema_name).toBe('frozen_data');
        expect(response.data.frozen).toBe(true);
    });

    it('should create schema with immutable flag', async () => {
        const response = await tenant.httpClient.post('/api/describe/audit_log', {
            schema_name: 'audit_log',
            status: 'active',
            immutable: true
        });

        expectSuccess(response, 'Failed to create schema');
        expect(response.data.schema_name).toBe('audit_log');
        expect(response.data.immutable).toBe(true);
    });

    it('should reject duplicate schema names', async () => {
        // Create first schema
        await tenant.httpClient.post('/api/describe/unique_test', {
            schema_name: 'unique_test'
        });

        // Try to create duplicate
        const response = await tenant.httpClient.post('/api/describe/unique_test', {
            schema_name: 'unique_test'
        });

        expectError(response);
    });

    it('should reject mismatched schema names (URL vs body)', async () => {
        const response = await tenant.httpClient.post('/api/describe/url_name', {
            schema_name: 'body_name'
        });

        // Should fail without ?force=true
        expectError(response);
    });

    it('should allow mismatched names with force parameter', async () => {
        const response = await tenant.httpClient.post('/api/describe/url_name2?force=true', {
            schema_name: 'body_name2'
        });

        // Should succeed with force, using body name
        expectSuccess(response, 'Failed to create schema');
        expect(response.data.schema_name).toBe('body_name2');
    });

    it('should not accept columns array (old pattern)', async () => {
        const response = await tenant.httpClient.post('/api/describe/with_columns', {
            schema_name: 'with_columns',
            columns: [
                { column_name: 'name', type: 'text' }
            ]
        });

        // Should fail - columns not allowed in schema creation
        expectError(response);
    });

    it('should create schema and it appears in list', async () => {
        // Create schema
        const createResponse = await tenant.httpClient.post('/api/describe/listed_schema', {
            schema_name: 'listed_schema'
        });

        expectSuccess(createResponse, 'Failed to create schema');

        // Verify it appears in schema list
        const listResponse = await tenant.httpClient.get('/api/describe');
        expect(listResponse.success).toBe(true);
        expect(listResponse.data).toContain('listed_schema');
    });
});
