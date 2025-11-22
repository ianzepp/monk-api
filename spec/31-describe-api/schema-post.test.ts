import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * POST /api/describe/:schema - Create Schema
 *
 * Tests schema creation endpoint. Validates schema creation with various
 * metadata and protection settings.
 */

describe('POST /api/describe/:schema - Create Schema', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('schema-post');
    });

    it('should create schema with minimal fields', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_minimal', {
            schema_name: 'test_minimal',
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_minimal');
        expect(response.data.id).toBeDefined();
        expect(response.data.created_at).toBeDefined();
        expect(response.data.updated_at).toBeDefined();
    });

    it('should create schema with description', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_description', {
            schema_name: 'test_description',
            description: 'Test schema with description',
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_description');
        expect(response.data.description).toBe('Test schema with description');
    });

    it('should create schema with active status', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_active', {
            schema_name: 'test_active',
            status: 'active',
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_active');
        expect(response.data.status).toBe('active');
    });

    it('should create schema with sudo protection', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_sudo', {
            schema_name: 'test_sudo',
            sudo: true,
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_sudo');
        expect(response.data.sudo).toBe(true);
    });

    it('should create schema with freeze protection', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_freeze', {
            schema_name: 'test_freeze',
            freeze: true,
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_freeze');
        expect(response.data.freeze).toBe(true);
    });

    it('should create schema with immutable flag', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_immutable', {
            schema_name: 'test_immutable',
            immutable: true,
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_immutable');
        expect(response.data.immutable).toBe(true);
    });

    it('should create schema with all fields', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_complete', {
            schema_name: 'test_complete',
            status: 'active',
            description: 'Complete test schema',
            sudo: true,
            freeze: false,
            immutable: false,
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_complete');
        expect(response.data.status).toBe('active');
        expect(response.data.description).toBe('Complete test schema');
        expect(response.data.sudo).toBe(true);
        expect(response.data.freeze).toBe(false);
        expect(response.data.immutable).toBe(false);
    });

    it('should reject missing schema_name field', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_missing', {
            description: 'Missing schema_name',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should reject schema name mismatch without force', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_mismatch_url', {
            schema_name: 'test_mismatch_body',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('SCHEMA_NAME_MISMATCH');
    });

    it('should allow schema name mismatch with force parameter', async () => {
        const response = await tenant.httpClient.post('/api/describe/test_force_url?force=true', {
            schema_name: 'test_force_body',
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('test_force_body');
    });

    it('should reject duplicate schema name', async () => {
        const schemaName = 'test_duplicate';

        // Create schema first time
        const firstResponse = await tenant.httpClient.post(`/api/describe/${schemaName}`, {
            schema_name: schemaName,
        });

        expectSuccess(firstResponse);

        // Try to create same schema again
        const secondResponse = await tenant.httpClient.post(`/api/describe/${schemaName}`, {
            schema_name: schemaName,
        });

        expect(secondResponse.success).toBe(false);
        expect(secondResponse.error_code).toBe('SCHEMA_EXISTS');
    });

    it('should reject invalid schema name with special characters', async () => {
        const response = await tenant.httpClient.post('/api/describe/test-invalid-name', {
            schema_name: 'test-invalid-name',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('INVALID_SCHEMA_NAME');
    });

    it('should reject invalid schema name starting with number', async () => {
        const response = await tenant.httpClient.post('/api/describe/123invalid', {
            schema_name: '123invalid',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('INVALID_SCHEMA_NAME');
    });
});
