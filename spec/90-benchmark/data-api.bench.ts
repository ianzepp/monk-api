import { describe, bench, beforeAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';

/**
 * Data API Performance Benchmarks
 *
 * Measures baseline performance for CRUD operations on existing models.
 * Run with: npm run test:unit -- --run --benchmark spec/90-benchmark/data-api.bench.ts
 */

describe('Data API Benchmarks', () => {
    let tenant: TestTenant;
    let testRecordId: string;
    let counter = 0;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('bench-data');

        // Create test model
        await tenant.httpClient.post('/api/describe/accounts', {});
        await tenant.httpClient.post('/api/describe/accounts/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/accounts/fields/email', {
            field_name: 'email',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/accounts/fields/username', {
            field_name: 'username',
            type: 'text',
        });

        // Warmup - create some initial records
        for (let i = 0; i < 5; i++) {
            await tenant.httpClient.post('/api/data/accounts', [
                { name: `Warmup ${i}`, email: `warmup${i}@test.com`, username: `warmup${i}` },
            ]);
        }

        // Get a record ID for update benchmarks
        const response = await tenant.httpClient.get('/api/data/accounts');
        testRecordId = response.data[0].id;
    });

    describe('Single Record Operations', () => {
        bench(
            'POST /api/data/:model - Create single record',
            async () => {
                counter++;
                const response = await tenant.httpClient.post('/api/data/accounts', [
                    {
                        name: `Bench User ${counter}`,
                        email: `bench${counter}@test.com`,
                        username: `bench${counter}`,
                    },
                ]);
                expectSuccess(response);
            },
            { iterations: 50, time: 30000 }
        );

        bench(
            'GET /api/data/:model - List all records',
            async () => {
                const response = await tenant.httpClient.get('/api/data/accounts');
                expectSuccess(response);
            },
            { iterations: 50, time: 30000 }
        );

        bench(
            'GET /api/data/:model/:id - Get single record',
            async () => {
                const response = await tenant.httpClient.get(`/api/data/accounts/${testRecordId}`);
                expectSuccess(response);
            },
            { iterations: 50, time: 30000 }
        );

        bench(
            'PUT /api/data/:model/:id - Update single record',
            async () => {
                counter++;
                const response = await tenant.httpClient.put(`/api/data/accounts/${testRecordId}`, {
                    name: `Updated User ${counter}`,
                });
                expectSuccess(response);
            },
            { iterations: 20, time: 30000 }
        );
    });

    describe('Bulk Operations', () => {
        bench(
            'POST /api/data/:model - Create batch of 10 records',
            async () => {
                counter++;
                const batch = Array.from({ length: 10 }, (_, i) => ({
                    name: `Bulk User ${counter}_${i}`,
                    email: `bulk${counter}_${i}@test.com`,
                    username: `bulk${counter}_${i}`,
                }));

                const response = await tenant.httpClient.post('/api/data/accounts', batch);
                expectSuccess(response);
            },
            { iterations: 10, time: 30000 }
        );
    });
});
