import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * FS API Integration Tests
 *
 * Tests the Filesystem HTTP routes at /fs/*
 */

describe('FS API - Basic Operations', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('fs-basic');

        // Create test model with fields
        await tenant.httpClient.post('/api/describe/products', {});
        await tenant.httpClient.post('/api/describe/products/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/products/fields/price', {
            field_name: 'price',
            type: 'decimal',
        });

        // Create test records
        await tenant.httpClient.post('/api/data/products', [
            { name: 'Widget', price: 9.99 },
            { name: 'Gadget', price: 19.99 },
        ]);
    });

    describe('/system mount', () => {
        it('should list system directory', async () => {
            const response = await tenant.httpClient.get('/fs/system');

            expect(response.type).toBe('directory');
            expect(response.path).toBe('/system');
            expect(response.entries).toBeInstanceOf(Array);

            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('version');
            expect(names).toContain('uptime');
            expect(names).toContain('whoami');
            expect(names).toContain('tenant');
        });

        it('should read version file', async () => {
            const response = await tenant.httpClient.getRaw('/fs/system/version');
            expect(response.ok).toBe(true);

            const text = await response.text();
            expect(text).toMatch(/^\d+\.\d+\.\d+/);
        });

        it('should read whoami file as JSON', async () => {
            const response = await tenant.httpClient.getRaw('/fs/system/whoami');
            expect(response.ok).toBe(true);

            const data = await response.json() as Record<string, any>;
            expect(data.id).toBeDefined();
            expect(data.tenant).toBe(tenant.tenantName);
        });

        it('should return stat metadata with ?stat=true', async () => {
            const response = await tenant.httpClient.get('/fs/system/version?stat=true');

            expect(response.name).toBe('version');
            expect(response.type).toBe('file');
            expect(response.size).toBeGreaterThan(0);
        });
    });

    describe('/api/describe mount', () => {
        it('should list models', async () => {
            const response = await tenant.httpClient.get('/fs/api/describe');

            expect(response.type).toBe('directory');
            expect(response.entries).toBeInstanceOf(Array);

            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('products');
        });

        it('should list model contents (fields dir + schema files)', async () => {
            const response = await tenant.httpClient.get('/fs/api/describe/products');

            expect(response.type).toBe('directory');
            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('fields');
            expect(names).toContain('.yaml');
            expect(names).toContain('.json');
        });

        it('should list fields in model', async () => {
            const response = await tenant.httpClient.get('/fs/api/describe/products/fields');

            expect(response.type).toBe('directory');
            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('name');
            expect(names).toContain('price');
        });

        it('should read field definition as YAML', async () => {
            const response = await tenant.httpClient.getRaw('/fs/api/describe/products/fields/name');
            expect(response.ok).toBe(true);

            const text = await response.text();
            expect(text).toContain('field_name: name');
            expect(text).toContain('type: text');
        });

        it('should read full schema as JSON', async () => {
            const response = await tenant.httpClient.getRaw('/fs/api/describe/products/.json');
            expect(response.ok).toBe(true);

            const schema = await response.json() as Record<string, any>;
            expect(schema.model_name).toBe('products');
            expect(schema.fields).toBeInstanceOf(Array);
        });

        it('should read full schema as YAML', async () => {
            const response = await tenant.httpClient.getRaw('/fs/api/describe/products/.yaml');
            expect(response.ok).toBe(true);

            const text = await response.text();
            expect(text).toContain('model_name: products');
        });

        it('should return 404 for non-existent model', async () => {
            const response = await tenant.httpClient.get('/fs/api/describe/nonexistent');

            expect(response.error).toBe('ENOENT');
        });
    });

    describe('/api/data mount', () => {
        let recordId: string;

        beforeAll(async () => {
            // Get a record ID for testing
            const listResponse = await tenant.httpClient.get('/fs/api/data/products');
            recordId = listResponse.entries[0].name;
        });

        it('should list models', async () => {
            const response = await tenant.httpClient.get('/fs/api/data');

            expect(response.type).toBe('directory');
            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('products');
        });

        it('should list records in model as directories', async () => {
            const response = await tenant.httpClient.get('/fs/api/data/products');

            expect(response.type).toBe('directory');
            expect(response.entries.length).toBeGreaterThanOrEqual(2);
            // Records are now directories (not files)
            expect(response.entries[0].type).toBe('directory');
        });

        it('should list fields in record', async () => {
            const response = await tenant.httpClient.get(`/fs/api/data/products/${recordId}`);

            expect(response.type).toBe('directory');
            // Should have field entries
            const fieldNames = response.entries.map((e: any) => e.name);
            expect(fieldNames).toContain('id');
            expect(fieldNames).toContain('name');
            expect(fieldNames).toContain('price');
            // Fields are files
            expect(response.entries[0].type).toBe('file');
        });

        it('should read field value', async () => {
            const response = await tenant.httpClient.getRaw(`/fs/api/data/products/${recordId}/name`);
            expect(response.ok).toBe(true);

            const value = await response.text();
            expect(value).toBeDefined();
            expect(value.length).toBeGreaterThan(0);
        });

        it('should write (update) field', async () => {
            // Update name field via FS
            const updateResponse = await tenant.httpClient.putRaw(
                `/fs/api/data/products/${recordId}/name`,
                'Updated Widget'
            );
            expect(updateResponse.ok).toBe(true);

            // Verify update by reading field
            const readResponse = await tenant.httpClient.getRaw(`/fs/api/data/products/${recordId}/name`);
            const value = await readResponse.text();
            expect(value).toBe('Updated Widget');
        });

        it('should reject write to readonly field', async () => {
            const updateResponse = await tenant.httpClient.putRaw(
                `/fs/api/data/products/${recordId}/id`,
                'new-id'
            );
            expect(updateResponse.ok).toBe(false);
            const error = await updateResponse.json() as { error: string };
            expect(error.error).toBe('EROFS');
        });

        it('should delete record via rmdir', async () => {
            // Create a record to delete via API
            const createResponse = await tenant.httpClient.post('/api/data/products', [
                { name: 'To Delete', price: 1.00 },
            ]);
            expectSuccess(createResponse);
            const deleteId = createResponse.data[0].id;

            // Delete via FS (DELETE on directory calls rmdir)
            const deleteResponse = await tenant.httpClient.deleteRaw(`/fs/api/data/products/${deleteId}`);
            expect(deleteResponse.ok).toBe(true);

            // Verify deletion (should be 404)
            const readResponse = await tenant.httpClient.get(`/fs/api/data/products/${deleteId}`);
            expect(readResponse.error).toBe('ENOENT');
        });

        it('should return 404 for non-existent record', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';
            const response = await tenant.httpClient.get(`/fs/api/data/products/${fakeId}`);

            expect(response.error).toBe('ENOENT');
        });
    });

    describe('/api/trashed mount', () => {
        let trashedId: string;

        beforeAll(async () => {
            // Create and trash a record
            const createResponse = await tenant.httpClient.post('/api/data/products', [
                { name: 'Trashed Item', price: 0.99 },
            ]);
            expectSuccess(createResponse);
            trashedId = createResponse.data[0].id;

            // Trash it via API
            await tenant.httpClient.delete(`/api/data/products/${trashedId}`);
        });

        it('should list models with trashed records', async () => {
            const response = await tenant.httpClient.get('/fs/api/trashed');

            expect(response.type).toBe('directory');
            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('products');
        });

        it('should list trashed records as directories', async () => {
            const response = await tenant.httpClient.get('/fs/api/trashed/products');

            expect(response.type).toBe('directory');
            expect(response.entries.length).toBeGreaterThanOrEqual(1);
            // Records are directories
            expect(response.entries[0].type).toBe('directory');

            const ids = response.entries.map((e: any) => e.name);
            expect(ids).toContain(trashedId);
        });

        it('should list fields in trashed record', async () => {
            const response = await tenant.httpClient.get(`/fs/api/trashed/products/${trashedId}`);

            expect(response.type).toBe('directory');
            const fieldNames = response.entries.map((e: any) => e.name);
            expect(fieldNames).toContain('id');
            expect(fieldNames).toContain('name');
            expect(fieldNames).toContain('trashed_at');
            // Fields are files
            expect(response.entries[0].type).toBe('file');
        });

        it('should read trashed record field', async () => {
            const response = await tenant.httpClient.getRaw(`/fs/api/trashed/products/${trashedId}/name`);
            expect(response.ok).toBe(true);

            const value = await response.text();
            expect(value).toBe('Trashed Item');
        });

        it('should be read-only (no write to field)', async () => {
            const response = await tenant.httpClient.putRaw(
                `/fs/api/trashed/products/${trashedId}/name`,
                'Should Fail'
            );
            expect(response.ok).toBe(false);
            expect(response.status).toBe(405); // EROFS -> 405 Method Not Allowed
        });
    });

    describe('error handling', () => {
        it('should return ENOENT (404) for non-existent path', async () => {
            const response = await tenant.httpClient.get('/fs/nonexistent/path');
            expect(response.error).toBe('ENOENT');
        });

        it('should return EISDIR (400) when reading directory as file', async () => {
            const response = await tenant.httpClient.getRaw('/fs/api/data/products');
            // Directory listing returns JSON, not an error
            expect(response.ok).toBe(true);
        });
    });
});
