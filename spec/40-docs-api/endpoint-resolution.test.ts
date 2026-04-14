import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { HttpError } from '@src/lib/errors/http-error.js';
import DocsEndpointGet from '@src/routes/docs/endpoint-GET.js';

describe('docs endpoint resolution', () => {
    it('serves nested describe field endpoint docs', async () => {
        const response = await request('/docs/api/describe/model/fields/field/GET');
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain('# GET /api/describe/:model/fields/:field');
    });

    it('keeps existing model endpoint docs working', async () => {
        const response = await request('/docs/api/describe/model/GET');
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain('# GET /api/describe/:model');
    });
});

async function request(path: string): Promise<Response> {
    const app = new Hono();
    app.get('/docs/*', DocsEndpointGet);
    app.onError((error: Error, c: any) => {
        if (error instanceof HttpError) {
            return c.json(error.toJSON(), error.statusCode);
        }
        return c.json({ success: false, error: String(error) }, 500);
    });

    return await app.request(path);
}
