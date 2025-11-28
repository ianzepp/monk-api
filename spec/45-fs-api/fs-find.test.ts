import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * FS FindMount Integration Tests
 *
 * Tests the /fs/api/find mount which exposes saved filters as executable query files.
 */

describe('FS API - FindMount', () => {
    let tenant: TestTenant;
    let highValueFilterId: string;
    let recentFilterId: string;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('fs-find');

        // Create test model with fields
        await tenant.httpClient.post('/api/describe/orders', {});
        await tenant.httpClient.post('/api/describe/orders/fields/customer', {
            field_name: 'customer',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/orders/fields/amount', {
            field_name: 'amount',
            type: 'decimal',
        });
        await tenant.httpClient.post('/api/describe/orders/fields/status', {
            field_name: 'status',
            type: 'text',
        });

        // Create test records
        await tenant.httpClient.post('/api/data/orders', [
            { customer: 'Alice', amount: 1500.00, status: 'completed' },
            { customer: 'Bob', amount: 50.00, status: 'pending' },
            { customer: 'Charlie', amount: 2000.00, status: 'completed' },
            { customer: 'Diana', amount: 75.00, status: 'cancelled' },
            { customer: 'Eve', amount: 3500.00, status: 'pending' },
        ]);

        // Create saved filters via /api/data/filters
        const highValueResponse = await tenant.httpClient.post('/api/data/filters', [{
            name: 'high-value',
            model_name: 'orders',
            where: { amount: { $gte: 1000 } },
            order: [{ field: 'amount', sort: 'desc' }],
        }]);
        expectSuccess(highValueResponse);
        highValueFilterId = highValueResponse.data[0].id;

        const recentResponse = await tenant.httpClient.post('/api/data/filters', [{
            name: 'pending-orders',
            model_name: 'orders',
            where: { status: 'pending' },
        }]);
        expectSuccess(recentResponse);
        recentFilterId = recentResponse.data[0].id;
    });

    describe('/api/find root', () => {
        it('should list models with saved filters', async () => {
            const response = await tenant.httpClient.get('/fs/api/find');

            expect(response.type).toBe('directory');
            expect(response.entries).toBeInstanceOf(Array);

            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('orders');
        });

        it('should only show models that have filters', async () => {
            const response = await tenant.httpClient.get('/fs/api/find');

            // products model exists (from fs-basic tests) but has no filters
            const names = response.entries.map((e: any) => e.name);
            expect(names).not.toContain('products');
        });

        it('should return stat metadata with ?stat=true', async () => {
            const response = await tenant.httpClient.get('/fs/api/find?stat=true');

            expect(response.name).toBe('find');
            expect(response.type).toBe('directory');
        });
    });

    describe('/api/find/:model', () => {
        it('should list saved filters for a model', async () => {
            const response = await tenant.httpClient.get('/fs/api/find/orders');

            expect(response.type).toBe('directory');
            expect(response.entries).toBeInstanceOf(Array);

            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('high-value');
            expect(names).toContain('pending-orders');
        });

        it('should return filters as file entries', async () => {
            const response = await tenant.httpClient.get('/fs/api/find/orders');

            const highValueEntry = response.entries.find((e: any) => e.name === 'high-value');
            expect(highValueEntry.type).toBe('file');
            expect(highValueEntry.mode).toBe('444'); // read-only (returned as octal string)
        });

        it('should return 404 for model without filters', async () => {
            // Create a model without any filters
            await tenant.httpClient.post('/api/describe/empty_model', {});

            const response = await tenant.httpClient.get('/fs/api/find/empty_model');
            expect(response.error).toBe('ENOENT');
        });

        it('should return 404 for non-existent model', async () => {
            const response = await tenant.httpClient.get('/fs/api/find/nonexistent');
            expect(response.error).toBe('ENOENT');
        });
    });

    describe('/api/find/:model/:filter - execute filter', () => {
        it('should execute filter and return results', async () => {
            const response = await tenant.httpClient.getRaw('/fs/api/find/orders/high-value');
            expect(response.ok).toBe(true);

            const results = await response.json() as Record<string, any>[];
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(3); // Alice (1500), Charlie (2000), Eve (3500)

            // Should be ordered by amount desc
            expect(results[0].customer).toBe('Eve');
            expect(results[0].amount).toBe(3500);
            expect(results[1].customer).toBe('Charlie');
            expect(results[2].customer).toBe('Alice');
        });

        it('should execute filter with where clause', async () => {
            const response = await tenant.httpClient.getRaw('/fs/api/find/orders/pending-orders');
            expect(response.ok).toBe(true);

            const results = await response.json() as Record<string, any>[];
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(2); // Bob and Eve are pending

            // All results should have pending status
            for (const result of results) {
                expect(result.status).toBe('pending');
            }
        });

        it('should return stat metadata with ?stat=true', async () => {
            const response = await tenant.httpClient.get('/fs/api/find/orders/high-value?stat=true');

            expect(response.name).toBe('high-value');
            expect(response.type).toBe('file');
            expect(response.mode).toBe('444'); // returned as octal string
        });

        it('should return 404 for non-existent filter', async () => {
            const response = await tenant.httpClient.get('/fs/api/find/orders/nonexistent');
            expect(response.error).toBe('ENOENT');
        });

        it('should be read-only (no write)', async () => {
            const response = await tenant.httpClient.putRaw(
                '/fs/api/find/orders/high-value',
                JSON.stringify({ where: { amount: { $gte: 500 } } })
            );
            expect(response.ok).toBe(false);
            expect(response.status).toBe(405); // EROFS -> 405 Method Not Allowed
        });
    });

    describe('filter with limit/offset', () => {
        beforeAll(async () => {
            // Create a filter with limit
            await tenant.httpClient.post('/api/data/filters', [{
                name: 'top-3',
                model_name: 'orders',
                order: [{ field: 'amount', sort: 'desc' }],
                limit: 3,
            }]);
        });

        it('should respect limit in filter', async () => {
            const response = await tenant.httpClient.getRaw('/fs/api/find/orders/top-3');
            expect(response.ok).toBe(true);

            const results = await response.json() as Record<string, any>[];
            expect(results.length).toBe(3);

            // Should be top 3 by amount
            expect(results[0].amount).toBe(3500); // Eve
            expect(results[1].amount).toBe(2000); // Charlie
            expect(results[2].amount).toBe(1500); // Alice
        });
    });

    describe('filter with select', () => {
        beforeAll(async () => {
            // Create a filter with select (field projection)
            await tenant.httpClient.post('/api/data/filters', [{
                name: 'customers-only',
                model_name: 'orders',
                select: ['id', 'customer'],
            }]);
        });

        it('should respect select in filter', async () => {
            const response = await tenant.httpClient.getRaw('/fs/api/find/orders/customers-only');
            expect(response.ok).toBe(true);

            const results = await response.json() as Record<string, any>[];
            expect(results.length).toBe(5);

            // Should only have id and customer fields
            for (const result of results) {
                expect(result.id).toBeDefined();
                expect(result.customer).toBeDefined();
                // amount and status should not be present
                expect(result.amount).toBeUndefined();
                expect(result.status).toBeUndefined();
            }
        });
    });

    describe('multiple models with filters', () => {
        beforeAll(async () => {
            // Create another model with filters
            await tenant.httpClient.post('/api/describe/customers', {});
            await tenant.httpClient.post('/api/describe/customers/fields/name', {
                field_name: 'name',
                type: 'text',
            });

            await tenant.httpClient.post('/api/data/customers', [
                { name: 'Customer A' },
                { name: 'Customer B' },
            ]);

            await tenant.httpClient.post('/api/data/filters', [{
                name: 'all-customers',
                model_name: 'customers',
            }]);
        });

        it('should list all models with filters', async () => {
            const response = await tenant.httpClient.get('/fs/api/find');

            const names = response.entries.map((e: any) => e.name);
            expect(names).toContain('orders');
            expect(names).toContain('customers');
        });

        it('should list filters for each model separately', async () => {
            const ordersResponse = await tenant.httpClient.get('/fs/api/find/orders');
            const customersResponse = await tenant.httpClient.get('/fs/api/find/customers');

            const orderFilters = ordersResponse.entries.map((e: any) => e.name);
            const customerFilters = customersResponse.entries.map((e: any) => e.name);

            expect(orderFilters).toContain('high-value');
            expect(orderFilters).not.toContain('all-customers');

            expect(customerFilters).toContain('all-customers');
            expect(customerFilters).not.toContain('high-value');
        });
    });
});
