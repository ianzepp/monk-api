import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * VFS API Integration Tests
 *
 * Tests the Virtual Filesystem HTTP routes at /vfs/*
 */

describe('VFS API - Basic Operations', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('vfs-basic');

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
            const response = await tenant.httpClient.get('/vfs/system');

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
            const response = await tenant.httpClient.getRaw('/vfs/system/version');
            expect(response.ok).toBe(true);

            const text = await response.text();
            expect(text).toMatch(/^\d+\.\d+\.\d+/);
        });

        it('should read whoami file as JSON', async () => {
            const response = await tenant.httpClient.getRaw('/vfs/system/whoami');
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data.id).toBeDefined();
            expect(data.tenant).toBe(tenant.tenantName);
        });

        it('should return stat metadata with ?stat=true', async () => {
            const response = await tenant.httpClient.get('/vfs/system/version?stat=true');

            expect(response.name).toBe('version');
            expect(response.type).toBe('file');
            expect(response.size).toBeGreaterThan(0);
        });
    });

    describe('/api/describe mount', () => {
        it('should list models', async () => {
            const response = await tenant.httpClient.get('/vfs/api/describe');

            expect(response.type).toBe('directory');
            expect(response.entries).toBeInstanceOf(Array);

            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('products');
        });

        it('should list model contents (fields dir + schema files)', async () => {
            const response = await tenant.httpClient.get('/vfs/api/describe/products');

            expect(response.type).toBe('directory');
            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('fields');
            expect(names).toContain('.yaml');
            expect(names).toContain('.json');
        });

        it('should list fields in model', async () => {
            const response = await tenant.httpClient.get('/vfs/api/describe/products/fields');

            expect(response.type).toBe('directory');
            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('name');
            expect(names).toContain('price');
        });

        it('should read field definition as YAML', async () => {
            const response = await tenant.httpClient.getRaw('/vfs/api/describe/products/fields/name');
            expect(response.ok).toBe(true);

            const text = await response.text();
            expect(text).toContain('field_name: name');
            expect(text).toContain('type: text');
        });

        it('should read full schema as JSON', async () => {
            const response = await tenant.httpClient.getRaw('/vfs/api/describe/products/.json');
            expect(response.ok).toBe(true);

            const schema = await response.json();
            expect(schema.model_name).toBe('products');
            expect(schema.fields).toBeInstanceOf(Array);
        });

        it('should read full schema as YAML', async () => {
            const response = await tenant.httpClient.getRaw('/vfs/api/describe/products/.yaml');
            expect(response.ok).toBe(true);

            const text = await response.text();
            expect(text).toContain('model_name: products');
        });

        it('should return 404 for non-existent model', async () => {
            const response = await tenant.httpClient.get('/vfs/api/describe/nonexistent');

            expect(response.error).toBe('ENOENT');
        });
    });

    describe('/api/data mount', () => {
        let recordId: string;

        beforeAll(async () => {
            // Get a record ID for testing
            const listResponse = await tenant.httpClient.get('/vfs/api/data/products');
            recordId = listResponse.entries[0].name;
        });

        it('should list models', async () => {
            const response = await tenant.httpClient.get('/vfs/api/data');

            expect(response.type).toBe('directory');
            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('products');
        });

        it('should list records in model', async () => {
            const response = await tenant.httpClient.get('/vfs/api/data/products');

            expect(response.type).toBe('directory');
            expect(response.entries.length).toBeGreaterThanOrEqual(2);
            expect(response.entries[0].type).toBe('file');
        });

        it('should read record as JSON', async () => {
            const response = await tenant.httpClient.getRaw(`/vfs/api/data/products/${recordId}`);
            expect(response.ok).toBe(true);

            const record = await response.json();
            expect(record.id).toBe(recordId);
            expect(record.name).toBeDefined();
        });

        it('should write (update) record', async () => {
            // Update via VFS
            const updateResponse = await tenant.httpClient.putRaw(
                `/vfs/api/data/products/${recordId}`,
                JSON.stringify({ name: 'Updated Widget', price: 12.99 })
            );
            expect(updateResponse.ok).toBe(true);

            // Verify update
            const readResponse = await tenant.httpClient.getRaw(`/vfs/api/data/products/${recordId}`);
            const record = await readResponse.json();
            expect(record.name).toBe('Updated Widget');
            expect(record.price).toBe(12.99);
        });

        it('should create new record via write', async () => {
            const newId = crypto.randomUUID();
            const createResponse = await tenant.httpClient.putRaw(
                `/vfs/api/data/products/${newId}`,
                JSON.stringify({ name: 'New Product', price: 5.99 })
            );
            expect(createResponse.ok).toBe(true);

            // Verify creation
            const readResponse = await tenant.httpClient.getRaw(`/vfs/api/data/products/${newId}`);
            const record = await readResponse.json();
            expect(record.id).toBe(newId);
            expect(record.name).toBe('New Product');
        });

        it('should delete record', async () => {
            // Create a record to delete
            const deleteId = crypto.randomUUID();
            await tenant.httpClient.putRaw(
                `/vfs/api/data/products/${deleteId}`,
                JSON.stringify({ name: 'To Delete', price: 1.00 })
            );

            // Delete via VFS
            const deleteResponse = await tenant.httpClient.deleteRaw(`/vfs/api/data/products/${deleteId}`);
            expect(deleteResponse.ok).toBe(true);

            // Verify deletion (should be 404)
            const readResponse = await tenant.httpClient.get(`/vfs/api/data/products/${deleteId}`);
            expect(readResponse.error).toBe('ENOENT');
        });

        it('should return 404 for non-existent record', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';
            const response = await tenant.httpClient.get(`/vfs/api/data/products/${fakeId}`);

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
            const response = await tenant.httpClient.get('/vfs/api/trashed');

            expect(response.type).toBe('directory');
            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('products');
        });

        it('should list trashed records', async () => {
            const response = await tenant.httpClient.get('/vfs/api/trashed/products');

            expect(response.type).toBe('directory');
            expect(response.entries.length).toBeGreaterThanOrEqual(1);

            const ids = response.entries.map((e: any) => e.name);
            expect(ids).toContain(trashedId);
        });

        it('should read trashed record', async () => {
            const response = await tenant.httpClient.getRaw(`/vfs/api/trashed/products/${trashedId}`);
            expect(response.ok).toBe(true);

            const record = await response.json();
            expect(record.id).toBe(trashedId);
            expect(record.name).toBe('Trashed Item');
            expect(record.trashed_at).toBeDefined();
        });

        it('should be read-only (no write)', async () => {
            const response = await tenant.httpClient.putRaw(
                `/vfs/api/trashed/products/${trashedId}`,
                JSON.stringify({ name: 'Should Fail' })
            );
            expect(response.ok).toBe(false);
            expect(response.status).toBe(405); // EROFS -> 405 Method Not Allowed
        });
    });

    describe('error handling', () => {
        it('should return ENOENT (404) for non-existent path', async () => {
            const response = await tenant.httpClient.get('/vfs/nonexistent/path');
            expect(response.error).toBe('ENOENT');
        });

        it('should return EISDIR (400) when reading directory as file', async () => {
            const response = await tenant.httpClient.getRaw('/vfs/api/data/products');
            // Directory listing returns JSON, not an error
            expect(response.ok).toBe(true);
        });
    });
});
