import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-protected-clean-break');
process.env.JWT_SECRET = 'protected-test-secret';

const { HttpError } = await import('@src/lib/errors/http-error.js');
const { Infrastructure } = await import('@src/lib/infrastructure.js');
const { authValidatorMiddleware } = await import('@src/lib/middleware/auth-validator.js');

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;

describe('authValidatorMiddleware clean-break protected auth', () => {
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

    it('accepts a valid Monk bearer token and builds context from Monk state', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `protected_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
            owner_username: 'root_user',
        });
        const token = await sign({
            sub: user.id,
            user_id: user.id,
            username: user.auth,
            tenant: tenant.name,
            tenant_id: tenant.id,
            db_type: tenant.db_type,
            db: tenant.database,
            ns: tenant.schema,
            access: user.access,
            access_read: [],
            access_edit: [],
            access_full: [],
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 600,
        }, process.env.JWT_SECRET!);

        const response = await requestProtected(token);
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.tenant).toBe(tenant.name);
        expect(body.systemInit.userId).toBe(user.id);
        expect(body.jwtPayload.tenant_id).toBe(tenant.id);
    });

    it('rejects malformed external-style bearer tokens', async () => {
        const response = await requestProtected('not.a.monk.token');
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH_TOKEN_INVALID');
    });

    it('rejects requests without bearer token', async () => {
        const response = await requestProtected(null);
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH_TOKEN_REQUIRED');
    });
});

async function requestProtected(token: string | null): Promise<Response> {
    const app = new Hono();
    app.use('*', authValidatorMiddleware);
    app.get('/protected', (c) => c.json({
        systemInit: (c as any).get('systemInit'),
        jwtPayload: (c as any).get('jwtPayload'),
        user: (c as any).get('user'),
    }));
    app.onError((error, c) => {
        if (error instanceof HttpError) {
            return c.json(error.toJSON(), error.statusCode as 401);
        }
        return c.json({ success: false, error: String(error) }, 500);
    });

    const headers: Record<string, string> = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return await app.request('/protected', { headers });
}
