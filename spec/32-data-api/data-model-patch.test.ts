import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers, expectSuccess } from '../test-helpers.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * PATCH /api/data/:model - Filter-Based Update
 *
 * Verifies PATCH routing to the existing model-level update handler.
 */

describe('PATCH /api/data/:model - Filter-Based Update', () => {
    let tenant: TestTenant;
    let activeRecordId: string;
    let secondActiveRecordId: string;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('data-model-patch');

        // Create test model
        await tenant.httpClient.post('/api/describe/products', {});
        await tenant.httpClient.post('/api/describe/products/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/products/fields/status', {
            field_name: 'status',
            type: 'text',
        });

        // Seed fixture records
        const createResponse = await tenant.httpClient.post('/api/data/products', [
            { name: 'Active One', status: 'active' },
            { name: 'Active Two', status: 'active' },
            { name: 'Inactive One', status: 'inactive' },
        ]);
        expectSuccess(createResponse, 'failed to seed model data for PATCH coverage');

        const activeIds = createResponse.data
            .filter((record: any) => record.status === 'active')
            .map((record: any) => record.id);

        [activeRecordId, secondActiveRecordId] = activeIds;
    });

    it('should route PATCH /api/data/:model to filter-based updates', async () => {
        const where = encodeURIComponent(JSON.stringify({ status: 'active' }));
        const patchResponse = await tenant.httpClient.request(
            `/api/data/products?where=${where}`,
            {
                method: 'PATCH',
                body: { status: 'updated' },
            }
        );

        expect(patchResponse.status).toBe(200);
        expect(patchResponse.json?.success).toBe(true);
        expect(patchResponse.json.data).toBeInstanceOf(Array);
        expect(patchResponse.json.data).toHaveLength(2);

        const activeIds = new Set([activeRecordId, secondActiveRecordId]);
        for (const record of patchResponse.json.data) {
            expect(activeIds.has(record.id)).toBe(true);
            expect(record.status).toBe('updated');
        }
    });

    it('should leave non-matching records unchanged', async () => {
        const activeResponse = await tenant.httpClient.post('/api/find/products', {
            where: { status: 'inactive' },
        });
        expectSuccess(activeResponse, 'failed to verify non-matching record update behavior');

        const nonMatching = activeResponse.data.find((record: any) => record.name === 'Inactive One');
        expect(nonMatching).toBeDefined();
        expect(nonMatching.status).toBe('inactive');
    });
});
