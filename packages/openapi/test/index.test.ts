import { Hono } from 'hono';
import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/index';

describe('OpenAPI field type mapping', () => {
    it('maps full scalar and array field types', async () => {
        const honoApp = new Hono();

        honoApp.get('/api/data/models', () =>
            Response.json({
                success: true,
                data: [{ id: 'model-1', model_name: 'product', description: 'Product model' }],
            })
        );

        honoApp.get('/api/data/fields', () =>
            Response.json({
                success: true,
                data: [
                    { id: 'field-text', model_id: 'model-1', field_name: 'name', type: 'text' },
                    { id: 'field-int', model_id: 'model-1', field_name: 'quantity', type: 'integer' },
                    { id: 'field-dec', model_id: 'model-1', field_name: 'price', type: 'decimal' },
                    { id: 'field-num', model_id: 'model-1', field_name: 'ratio', type: 'numeric' },
                    { id: 'field-bool', model_id: 'model-1', field_name: 'active', type: 'boolean' },
                    { id: 'field-ts', model_id: 'model-1', field_name: 'updated', type: 'timestamp' },
                    { id: 'field-date', model_id: 'model-1', field_name: 'birthday', type: 'date' },
                    { id: 'field-uuid', model_id: 'model-1', field_name: 'owner_id', type: 'uuid' },
                    { id: 'field-json', model_id: 'model-1', field_name: 'meta', type: 'jsonb' },
                    { id: 'field-bin', model_id: 'model-1', field_name: 'payload', type: 'binary' },
                    { id: 'field-text-array', model_id: 'model-1', field_name: 'tags', type: 'text[]' },
                    { id: 'field-int-array', model_id: 'model-1', field_name: 'scores', type: 'integer[]' },
                    { id: 'field-dec-array', model_id: 'model-1', field_name: 'weights', type: 'decimal[]' },
                    { id: 'field-num-array', model_id: 'model-1', field_name: 'ratios', type: 'numeric[]' },
                    { id: 'field-uuid-array', model_id: 'model-1', field_name: 'related', type: 'uuid[]' },
                ],
            })
        );

        const app = createApp({
            client: null,
            token: 'test-token',
            appName: 'openapi',
            tenantName: 'tenant-1',
            honoApp,
        });

        const response = await app.request(new Request('http://internal/openapi.json'));
        expect(response.status).toBe(200);

        const spec = (await response.json()) as Record<string, any>;
        const schema = spec.components.schemas.product.properties as Record<string, any>;

        expect(schema.name).toEqual({ type: 'string' });
        expect(schema.quantity).toEqual({ type: 'integer', format: 'int32' });
        expect(schema.price).toEqual({ type: 'number', format: 'double' });
        expect(schema.ratio).toEqual({ type: 'number', format: 'double' });
        expect(schema.active).toEqual({ type: 'boolean' });
        expect(schema.updated).toEqual({ type: 'string', format: 'date-time' });
        expect(schema.birthday).toEqual({ type: 'string', format: 'date' });
        expect(schema.owner_id).toEqual({ type: 'string', format: 'uuid' });
        expect(schema.meta).toEqual({ type: 'object', additionalProperties: true });
        expect(schema.payload).toEqual({ type: 'string', format: 'byte' });
        expect(schema.tags).toEqual({ type: 'array', items: { type: 'string' } });
        expect(schema.scores).toEqual({ type: 'array', items: { type: 'integer', format: 'int32' } });
        expect(schema.weights).toEqual({ type: 'array', items: { type: 'number', format: 'double' } });
        expect(schema.ratios).toEqual({ type: 'array', items: { type: 'number', format: 'double' } });
        expect(schema.related).toEqual({ type: 'array', items: { type: 'string', format: 'uuid' } });
    });

    it('marks unsupported field types explicitly', async () => {
        const honoApp = new Hono();

        honoApp.get('/api/data/models', () =>
            Response.json({
                success: true,
                data: [{ id: 'model-1', model_name: 'product', description: 'Product model' }],
            })
        );

        honoApp.get('/api/data/fields', () =>
            Response.json({
                success: true,
                data: [
                    { id: 'field-unsupported', model_id: 'model-1', field_name: 'mystery', type: 'mystery' },
                    { id: 'field-unsupported-array', model_id: 'model-1', field_name: 'mystery_array', type: 'mystery[]' },
                ],
            })
        );

        const app = createApp({
            client: null,
            token: 'test-token',
            appName: 'openapi',
            tenantName: 'tenant-1',
            honoApp,
        });

        const response = await app.request(new Request('http://internal/openapi.json'));
        expect(response.status).toBe(200);

        const spec = (await response.json()) as Record<string, any>;
        const schema = spec.components.schemas.product.properties as Record<string, any>;

        expect(schema.mystery.deprecated).toBe(true);
        expect(schema.mystery['x-monk-unsupported-type']).toBe('mystery');
        expect(schema.mystery.description).toBe("Unsupported Monk field type 'mystery'");

        expect(schema.mystery_array.deprecated).toBe(true);
        expect(schema.mystery_array.type).toBe('array');
        expect(schema.mystery_array['x-monk-unsupported-type']).toBe('mystery[]');
    });
});
