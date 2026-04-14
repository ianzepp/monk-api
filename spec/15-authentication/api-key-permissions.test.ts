import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-api-key-disabled');
process.env.JWT_SECRET = 'api-key-disabled-secret';

const { HttpError } = await import('@src/lib/errors/http-error.js');
const { Infrastructure } = await import('@src/lib/infrastructure.js');
const { authValidatorMiddleware } = await import('@src/lib/middleware/auth-validator.js');

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;

describe('authValidatorMiddleware clean-break API key removal', () => {
    beforeAll(async () => {
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        mkdirSync(TEMP_DATA_DIR, { recursive: true });
        await Infrastructure.resetForTests();
        await Infrastructure.initialize();
    });

    afterAll(async () => {
        await Infrastructure.resetForTests();
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    });

    it('rejects X-API-Key authentication', async () => {
        const response = await requestProtected({ 'X-API-Key': 'mk_test_deadbeefdeadbeef' });
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH_TOKEN_REQUIRED');
    });

    it('rejects Bearer API key-shaped tokens', async () => {
        const response = await requestProtected({ Authorization: 'Bearer mk_test_deadbeefdeadbeef' });
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH_TOKEN_INVALID');
    });
});

async function requestProtected(headers: Record<string, string>): Promise<Response> {
    const app = new Hono();
    app.use('*', authValidatorMiddleware);
    app.get('/protected', (c) => c.json({ ok: true }));
    app.onError((error, c) => {
        if (error instanceof HttpError) {
            return c.json(error.toJSON(), error.statusCode as 401);
        }
        return c.json({ success: false, error: String(error) }, 500);
    });

    return await app.request('/protected', { headers });
}
