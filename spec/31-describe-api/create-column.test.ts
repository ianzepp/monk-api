import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';

/**
 * POST /api/describe/:schema/:column - Create Column
 *
 * Tests adding columns to existing schemas. This is the new architecture
 * where columns are created individually after schema creation.
 */

describe('POST /api/describe/:schema/:column - Create Column', () => {
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

        expect(response.success).toBe(true);
        expect(response.data.schema_name).toBe('products');
        expect(response.data.column_name).toBe('name');
        expect(response.data.type).toBe('text');
    });

    it('should create required column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/sku', {
            type: 'text',
            required: true
        });

        expect(response.success).toBe(true);
        expect(response.data.required).toBe(true);
    });

    it('should create column with default value', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/in_stock', {
            type: 'boolean',
            default_value: 'true'
        });

        expect(response.success).toBe(true);
        expect(response.data.default_value).toBe('true');
    });

    it('should create column with description', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/price', {
            type: 'decimal',
            description: 'Product price in USD'
        });

        expect(response.success).toBe(true);
        expect(response.data.description).toBe('Product price in USD');
    });

    it('should create column with validation (pattern)', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/email', {
            type: 'text',
            pattern: '^[^@]+@[^@]+\\.[^@]+$'
        });

        expect(response.success).toBe(true);
        expect(response.data.pattern).toBe('^[^@]+@[^@]+\\.[^@]+$');
    });

    it('should create column with min/max validation', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/quantity', {
            type: 'integer',
            minimum: 0,
            maximum: 1000
        });

        expect(response.success).toBe(true);
        expect(response.data.minimum).toBe(0);
        expect(response.data.maximum).toBe(1000);
    });

    it('should create column with enum values', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/status', {
            type: 'text',
            enum_values: ['draft', 'published', 'archived']
        });

        expect(response.success).toBe(true);
        expect(response.data.enum_values).toEqual(['draft', 'published', 'archived']);
    });

    it('should create column with unique constraint', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/barcode', {
            type: 'text',
            unique: true
        });

        expect(response.success).toBe(true);
        expect(response.data.unique).toBe(true);
    });

    it('should create column with index', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/category', {
            type: 'text',
            index: true
        });

        expect(response.success).toBe(true);
        expect(response.data.index).toBe(true);
    });

    it('should create searchable text column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/description', {
            type: 'text',
            searchable: true
        });

        expect(response.success).toBe(true);
        expect(response.data.searchable).toBe(true);
    });

    it('should create immutable column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/created_by', {
            type: 'uuid',
            immutable: true
        });

        expect(response.success).toBe(true);
        expect(response.data.immutable).toBe(true);
    });

    it('should create sudo-protected column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/cost', {
            type: 'decimal',
            sudo: true
        });

        expect(response.success).toBe(true);
        expect(response.data.sudo).toBe(true);
    });

    it('should create column with transform', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/slug', {
            type: 'text',
            transform: 'lowercase'
        });

        expect(response.success).toBe(true);
        expect(response.data.transform).toBe('lowercase');
    });

    it('should create tracked column', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/notes', {
            type: 'text',
            tracked: true
        });

        expect(response.success).toBe(true);
        expect(response.data.tracked).toBe(true);
    });

    it('should create columns with various data types', async () => {
        const types = [
            { name: 'text_col', type: 'text' },
            { name: 'int_col', type: 'integer' },
            { name: 'dec_col', type: 'decimal' },
            { name: 'bool_col', type: 'boolean' },
            { name: 'ts_col', type: 'timestamp' },
            { name: 'date_col', type: 'date' },
            { name: 'uuid_col', type: 'uuid' },
            { name: 'json_col', type: 'jsonb' }
        ];

        for (const { name, type } of types) {
            const response = await tenant.httpClient.post(`/api/describe/products/${name}`, {
                type
            });
            
            expect(response.success).toBe(true);
            expect(response.data.type).toBe(type);
        }
    });

    it('should create array type columns', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/tags', {
            type: 'text[]'
        });

        expect(response.success).toBe(true);
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

        expect(response.success).toBe(false);
    });

    it('should reject column creation without type', async () => {
        const response = await tenant.httpClient.post('/api/describe/products/no_type', {
            description: 'Missing type field'
        });

        expect(response.success).toBe(false);
    });

    it('should reject column on non-existent schema', async () => {
        const response = await tenant.httpClient.post('/api/describe/nonexistent/column', {
            type: 'text'
        });

        expect(response.success).toBe(false);
    });
});
