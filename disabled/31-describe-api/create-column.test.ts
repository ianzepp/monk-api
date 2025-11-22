import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * POST /api/describe/:schema/columns/:column - Create Column
 *
 * Tests adding columns to existing schemas. This is the new architecture
 * where columns are created individually after schema creation.
 */

describe('POST /api/describe/:schema/columns/:column - Create Column', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('create-column');

        // Create test schema
        await tenant.httpClient.post('/api/describe/products', {
            schema_name: 'products',
            status: 'active'
        });
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should create column with minimal fields', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/name', {
            type: 'text'
        });

        expectSuccess(response);
        expect(response.data.schema_name).toBe('products');
        expect(response.data.column_name).toBe('name');
        expect(response.data.type).toBe('text');
    });

    it('should create required column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/sku', {
            type: 'text',
            required: true
        });

        expectSuccess(response);
        expect(response.data.required).toBe(true);
    });

    it('should create column with default value', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/in_stock', {
            type: 'boolean',
            default_value: true
        });

        expectSuccess(response);
        expect(response.data.default_value).toBe(true);
    });

    it('should create column with description', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/price', {
            type: 'decimal',
            description: 'Product price in USD'
        });

        expectSuccess(response);
        expect(response.data.description).toBe('Product price in USD');
    });

    it('should create column with validation (pattern)', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/email', {
            type: 'text',
            pattern: '^[^@]+@[^@]+\\.[^@]+$'
        });

        expectSuccess(response);
        expect(response.data.pattern).toBe('^[^@]+@[^@]+\\.[^@]+$');
    });

    it('should create column with min/max validation', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/quantity', {
            type: 'integer',
            minimum: 0,
            maximum: 1000
        });

        expectSuccess(response);
        expect(response.data.minimum).toBe(0);
        expect(response.data.maximum).toBe(1000);
    });

    it('should create column with enum values', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/status', {
            type: 'text',
            enum_values: ['draft', 'published', 'archived']
        });

        expectSuccess(response);
        expect(response.data.enum_values).toEqual(['draft', 'published', 'archived']);
    });

    it('should create column with unique constraint', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/barcode', {
            type: 'text',
            unique: true
        });

        expectSuccess(response);
        expect(response.data.unique).toBe(true);
    });

    it('should create column with index', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/category', {
            type: 'text',
            index: true
        });

        expectSuccess(response);
        expect(response.data.index).toBe(true);
    });

    it('should create searchable text column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/description', {
            type: 'text',
            searchable: true
        });

        expectSuccess(response);
        expect(response.data.searchable).toBe(true);
    });

    it('should create immutable column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/created_by', {
            type: 'uuid',
            immutable: true
        });

        expectSuccess(response);
        expect(response.data.immutable).toBe(true);
    });

    it('should create sudo-protected column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/cost', {
            type: 'decimal',
            sudo: true
        });

        expectSuccess(response);
        expect(response.data.sudo).toBe(true);
    });

    it('should create column with transform', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/slug', {
            type: 'text',
            transform: 'lowercase'
        });

        expectSuccess(response);
        expect(response.data.transform).toBe('lowercase');
    });

    it('should create tracked column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/notes', {
            type: 'text',
            tracked: true
        });

        expectSuccess(response);
        expect(response.data.tracked).toBe(true);
    });

    it('should create columns with various data types', async () => {
        const types = [
            { name: 'text_col', type: 'text', expected: 'text' },
            { name: 'int_col', type: 'integer', expected: 'integer' },
            { name: 'dec_col', type: 'decimal', expected: 'numeric' }, // PostgreSQL normalizes decimal to numeric
            { name: 'bool_col', type: 'boolean', expected: 'boolean' },
            { name: 'ts_col', type: 'timestamp', expected: 'timestamp' },
            { name: 'date_col', type: 'date', expected: 'date' },
            { name: 'uuid_col', type: 'uuid', expected: 'uuid' },
            { name: 'json_col', type: 'jsonb', expected: 'jsonb' }
        ];

        for (const { name, type, expected } of types) {
            const response = await tenant.httpClient.post(`/api/describe/products/${name}`, {
                type
            });

            expectSuccess(response);
            expect(response.data.type).toBe(expected);
        }
    });

    it('should create array type columns', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/tags', {
            type: 'text[]'
        });

        expectSuccess(response);
        expect(response.data.type).toBe('text[]');
        expect(response.data.is_array).toBe(true);
    });

    it('should reject duplicate column names', async () => {
        // Create column
        await tenant.httpClient.post('/api/describe/products/duplicate_test', {
            type: 'text'
        });

        // Try to create duplicate
        const response = await tenant.httpClient.post('/api/describe/products/duplicate_test', {
            type: 'text'
        });

        expectError(response);
    });

    it('should reject column creation without type', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/no_type', {
            description: 'Missing type field'
        });

        expectError(response);
    });

    it('should reject column on non-existent schema', async () => {
        const response = await tenant.httpClient.post('/api/describe/nonexistent/column', {
            type: 'text'
        });

        expectError(response);
    });
});
