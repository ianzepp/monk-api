import { describe, bench, beforeAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';

/**
 * Describe API Performance Benchmarks
 *
 * Measures performance for model and field operations (full validation pipeline).
 * Run with: npm run test:unit -- --run --benchmark spec/90-benchmark/describe-api.bench.ts
 */

describe('Describe API Benchmarks', () => {
    let tenant: TestTenant;
    let counter = 0;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('bench-describe');

        // Warmup - create a couple of models
        for (let i = 0; i < 2; i++) {
            await tenant.httpClient.post(`/api/describe/warmup_${i}`, {});
            await tenant.httpClient.post(`/api/describe/warmup_${i}/fields/test`, {
                field_name: 'test',
                type: 'text',
                required: true,
            });
        }
    });

    describe('Model Creation', () => {
        bench(
            'POST /api/describe/:model - Create simple model (2 fields)',
            async () => {
                counter++;
                const modelName = `simple_${counter}`;

                // Create model
                await tenant.httpClient.post(`/api/describe/${modelName}`, {});

                // Add fields
                await tenant.httpClient.post(`/api/describe/${modelName}/fields/name`, {
                    field_name: 'name',
                    type: 'text',
                    required: true,
                });
                await tenant.httpClient.post(`/api/describe/${modelName}/fields/email`, {
                    field_name: 'email',
                    type: 'text',
                    required: true,
                });
            },
            { iterations: 10, time: 60000 }
        );

        bench(
            'POST /api/describe/:model - Create complex model (10 fields)',
            async () => {
                counter++;
                const modelName = `complex_${counter}`;

                // Create model
                await tenant.httpClient.post(`/api/describe/${modelName}`, {});

                // Add 10 fields with various types
                const fields = [
                    { field_name: 'title', type: 'text', required: true },
                    { field_name: 'description', type: 'text', required: false },
                    { field_name: 'status', type: 'text', required: true },
                    { field_name: 'priority', type: 'integer', required: false },
                    { field_name: 'due_date', type: 'timestamp', required: false },
                    { field_name: 'assignee_id', type: 'uuid', required: false },
                    { field_name: 'is_urgent', type: 'boolean', required: false },
                    { field_name: 'estimated_hours', type: 'decimal', required: false },
                    { field_name: 'tags', type: 'text[]', required: false },
                    { field_name: 'metadata', type: 'jsonb', required: false },
                ];

                for (const field of fields) {
                    await tenant.httpClient.post(`/api/describe/${modelName}/fields/${field.field_name}`, field);
                }
            },
            { iterations: 5, time: 60000 }
        );
    });

    describe('Field Operations', () => {
        bench(
            'POST /api/describe/:model/fields/:field - Add field to existing model',
            async () => {
                counter++;
                const response = await tenant.httpClient.post(`/api/describe/warmup_0/fields/field_${counter}`, {
                    field_name: `field_${counter}`,
                    type: 'text',
                    required: false,
                    description: 'Benchmark test field',
                });
                expectSuccess(response);
            },
            { iterations: 10, time: 60000 }
        );
    });

    describe('Model Retrieval', () => {
        bench(
            'GET /api/describe/:model - Retrieve model metadata',
            async () => {
                const response = await tenant.httpClient.get('/api/describe/warmup_0');
                expectSuccess(response);
            },
            { iterations: 20, time: 30000 }
        );

        bench(
            'GET /api/describe - List all models',
            async () => {
                const response = await tenant.httpClient.get('/api/describe');
                expectSuccess(response);
            },
            { iterations: 20, time: 30000 }
        );
    });
});
