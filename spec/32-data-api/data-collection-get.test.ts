import { beforeAll, describe, expect, it } from 'bun:test';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';

describe('GET /api/data/:model - Collection Query Params', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('data-collection-get');

        await tenant.httpClient.post('/api/describe/pt_items', {});
        await tenant.httpClient.post('/api/describe/pt_items/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/pt_items/fields/quantity', {
            field_name: 'quantity',
            type: 'integer',
        });
        await tenant.httpClient.post('/api/describe/pt_items/fields/active', {
            field_name: 'active',
            type: 'boolean',
        });

        const createResponse = await tenant.httpClient.post('/api/data/pt_items', [
            { name: 'alpha', quantity: 1, active: true },
            { name: 'beta', quantity: 2, active: false },
        ]);
        expectSuccess(createResponse);
    });

    it('should honor where filters on the collection route', async () => {
        const response = await tenant.httpClient.get('/api/data/pt_items?where=%7B%22name%22:%22alpha%22%7D');

        expectSuccess(response);
        expect(Array.isArray(response.data)).toBe(true);
        expect(response.data).toHaveLength(1);
        expect(response.data[0].name).toBe('alpha');
    });

    it('should honor select projections on the collection route', async () => {
        const response = await tenant.httpClient.request('/api/data/pt_items?select=id,name,quantity', {
            method: 'GET',
        });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.json)).toBe(true);
        expect(response.json).toHaveLength(2);
        expect(response.json[0].id).toBeDefined();
        expect(response.json[0].name).toBeDefined();
        expect(response.json[0].quantity).toBeDefined();
        expect(response.json[0].active).toBeUndefined();
    });

    it('should honor limit on the collection route', async () => {
        const response = await tenant.httpClient.get('/api/data/pt_items?limit=1');

        expectSuccess(response);
        expect(response.data).toHaveLength(1);
    });
});
