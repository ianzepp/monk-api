import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-register-auth-broker');
process.env.AUTH0_BROKER_MODE = 'memory';

const { HttpError } = await import('@src/lib/errors/http-error.js');
const { Infrastructure } = await import('@src/lib/infrastructure.js');
const { resetMemoryAuth0BrokerForTests } = await import('@src/lib/auth0/index.js');
const { default: RegisterPost } = await import('@src/routes/auth/register/POST.js');

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;

describe('POST /auth/register - brokered tenant provisioning', () => {
    beforeAll(async () => {
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        mkdirSync(TEMP_DATA_DIR, { recursive: true });
        await Infrastructure.resetForTests();
        await Infrastructure.initialize();
    });

    beforeEach(() => {
        resetMemoryAuth0BrokerForTests();
    });

    afterAll(async () => {
        await Infrastructure.resetForTests();
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    });

    it('provisions a new tenant and returns a Monk token without requiring bearer auth', async () => {
        const response = await requestRegister({
            tenant: `register_auth_${Date.now()}`,
            username: 'root_user',
            password: 'register-password',
        });
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.data.tenant_id).toBeDefined();
        expect(body.data.username).toBe('root_user');
        expect(body.data.token).toBeDefined();
        expect(body.data.expires_in).toBe(24 * 60 * 60);
    });

    it('rejects duplicate tenant attempts', async () => {
        const tenant = `register_duplicate_${Date.now()}`;
        const first = await requestRegister({
            tenant,
            username: 'root_user',
            password: 'register-password',
        });
        expect(first.status).toBe(200);

        const second = await requestRegister({
            tenant,
            username: 'root_user',
            password: 'register-password',
        });
        const body = await second.json() as any;

        expect(second.status).toBe(409);
        expect(body.error_code).toBe('DATABASE_TENANT_EXISTS');
    });

    it('rejects non-canonical identity values', async () => {
        const response = await requestRegister({
            tenant: 'Bad Tenant',
            username: 'Root-User',
            password: 'register-password',
        });
        const body = await response.json() as any;

        expect(response.status).toBe(400);
        expect(body.error_code).toBe('AUTH_TENANT_INVALID');
    });
});

async function requestRegister(body: Record<string, unknown>): Promise<Response> {
    const app = new Hono();
    app.post('/auth/register', RegisterPost);
    app.onError((error, c) => {
        if (error instanceof HttpError) {
            return c.json(error.toJSON(), error.statusCode as 400);
        }
        return c.json({ success: false, error: String(error) }, 500);
    });

    return await app.request('/auth/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}
