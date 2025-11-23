import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * PUT /api/describe/:model/fields/:field - Update Field
 *
 * Tests updating field properties. Supports both metadata updates
 * and structural changes (which trigger ALTER TABLE).
 */

describe('PUT /api/describe/:model/fields/:field - Update Field', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('update-field');

        // Create test model
        await tenant.httpClient.post('/api/describe/products', {
            model_name: 'products',
            status: 'active'
        });

        // Create test field
        await tenant.httpClient.post('/api/describe/products/name', {
            type: 'text',
            required: false
        });
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should update field description (metadata)', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            description: 'Updated product name'
        });

        expectSuccess(response);
        expect(response.data.description).toBe('Updated product name');
    });

    it('should update validation pattern (metadata)', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            pattern: '^[A-Z]'
        });

        expectSuccess(response);
        expect(response.data.pattern).toBe('^[A-Z]');
    });

    it('should update min/max values (metadata)', async () => {
        // Create numeric field
        await tenant.httpClient.post('/api/describe/products/price', {
            type: 'decimal'
        });

        const response = await tenant.httpClient.put('/api/describe/products/price', {
            minimum: 0,
            maximum: 1000
        });

        expectSuccess(response);
        expect(response.data.minimum).toBe(0);
        expect(response.data.maximum).toBe(1000);
    });

    it('should update enum values (metadata)', async () => {
        // Create text field
        await tenant.httpClient.post('/api/describe/products/status', {
            type: 'text'
        });

        const response = await tenant.httpClient.put('/api/describe/products/status', {
            enum_values: ['active', 'inactive', 'pending']
        });

        expectSuccess(response);
        expect(response.data.enum_values).toEqual(['active', 'inactive', 'pending']);
    });

    it('should update immutable flag (metadata)', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            immutable: true
        });

        expectSuccess(response);
        expect(response.data.immutable).toBe(true);
    });

    it('should update sudo flag (metadata)', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            sudo: true
        });

        expectSuccess(response);
        expect(response.data.sudo).toBe(true);
    });

    it('should update tracked flag (metadata)', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            tracked: true
        });

        expectSuccess(response);
        expect(response.data.tracked).toBe(true);
    });

    it('should update transform (metadata)', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            transform: 'lowercase'
        });

        expectSuccess(response);
        expect(response.data.transform).toBe('lowercase');
    });

    it('should update required flag (structural - ALTER TABLE)', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            required: true
        });

        expectSuccess(response);
        expect(response.data.required).toBe(true);
    });

    it('should update default value (structural)', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            default_value: 'Untitled'
        });

        expectSuccess(response);
        expect(response.data.default_value).toBe('Untitled');
    });

    it('should persist updates across GET requests', async () => {
        // Update field
        await tenant.httpClient.put('/api/describe/products/name', {
            description: 'Persisted description',
            pattern: '^[A-Z]'
        });

        // Retrieve field
        const getResponse = await tenant.httpClient.get('/api/describe/products/name');

        expect(getResponse.success).toBe(true);
        expect(getResponse.data.description).toBe('Persisted description');
        expect(getResponse.data.pattern).toBe('^[A-Z]');
    });

    it('should update multiple fields at once', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            description: 'Multi-field update',
            pattern: '^[A-Za-z]',
            immutable: false,
            tracked: false
        });

        expectSuccess(response);
        expect(response.data.description).toBe('Multi-field update');
        expect(response.data.pattern).toBe('^[A-Za-z]');
        expect(response.data.immutable).toBe(false);
        expect(response.data.tracked).toBe(false);
    });

    it('should reject empty updates', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/name', {});

        expectError(response);
    });

    it('should return 404 for non-existent field', async () => {
        const response = await tenant.httpClient.put('/api/describe/products/nonexistent', {
            description: 'test'
        });

        expectError(response);
        expect(response.error_code).toBe('FIELD_NOT_FOUND');
    });

    it('should not allow updating field_name', async () => {
        // Attempt to change field name (should be ignored or fail)
        const response = await tenant.httpClient.put('/api/describe/products/name', {
            field_name: 'renamed_name',
            description: 'test'
        });

        // Even if successful, field_name should not change
        if (response.success) {
            const getResponse = await tenant.httpClient.get('/api/describe/products/name');
            expect(getResponse.data.field_name).toBe('name');
        }
    });
});
