import { afterEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { HttpError } from '@src/lib/errors/http-error.js';
import {
    assertLocalAuthEnabled,
    isLocalAuthEnabled,
    localAuthFlagName,
} from '@src/lib/auth/local-auth-policy.js';
import LoginPost from '@src/routes/auth/login/POST.js';
import RefreshPost from '@src/routes/auth/refresh/POST.js';
import { authValidatorMiddleware } from '@src/lib/middleware/auth-validator.js';

const originalEnv = { ...process.env };

describe('local auth clean-break policy', () => {
    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('is disabled by default outside production unless explicitly flagged', () => {
        process.env.NODE_ENV = 'test';
        delete process.env.MONK_ENABLE_LOCAL_AUTH;

        expect(isLocalAuthEnabled()).toBe(false);
        expect(() => assertLocalAuthEnabled('Local auth')).toThrow('Auth0/OIDC');
    });

    it('allows explicit development/test local auth with MONK_ENABLE_LOCAL_AUTH=true', () => {
        process.env.NODE_ENV = 'test';
        process.env.MONK_ENABLE_LOCAL_AUTH = 'true';

        expect(localAuthFlagName()).toBe('MONK_ENABLE_LOCAL_AUTH');
        expect(isLocalAuthEnabled()).toBe(true);
        expect(() => assertLocalAuthEnabled('Local auth')).not.toThrow();
    });

    it('keeps local auth disabled in production even when the flag is set', () => {
        process.env.NODE_ENV = 'production';
        process.env.MONK_ENABLE_LOCAL_AUTH = 'true';

        expect(isLocalAuthEnabled()).toBe(false);
    });

    it('rejects production local login before issuing a JWT', async () => {
        process.env.NODE_ENV = 'production';
        process.env.MONK_ENABLE_LOCAL_AUTH = 'true';

        const response = await requestPublic(LoginPost, { tenant: 'demo', username: 'root' });
        const body = await response.json() as any;

        expect(response.status).toBe(403);
        expect(body.error_code).toBe('LOCAL_AUTH_DISABLED');
    });

    it('rejects production local refresh before issuing a JWT', async () => {
        process.env.NODE_ENV = 'production';
        process.env.MONK_ENABLE_LOCAL_AUTH = 'true';

        const response = await requestPublic(RefreshPost, { token: 'not-used' });
        const body = await response.json() as any;

        expect(response.status).toBe(403);
        expect(body.error_code).toBe('LOCAL_AUTH_DISABLED');
    });

    it('rejects local HS256 protected-route tokens unless local auth is explicitly enabled', async () => {
        process.env.NODE_ENV = 'test';
        delete process.env.MONK_ENABLE_LOCAL_AUTH;
        delete process.env.AUTH0_ISSUER;
        delete process.env.AUTH0_DOMAIN;
        delete process.env.AUTH0_AUDIENCE;
        delete process.env.AUTH0_JWKS_URL;
        process.env.JWT_SECRET = 'local-secret';

        const token = await sign({ sub: 'local', exp: Math.floor(Date.now() / 1000) + 600 }, 'local-secret', 'HS256');
        const response = await requestProtected(token);
        const body = await response.json() as any;

        expect(response.status).toBe(403);
        expect(body.error_code).toBe('LOCAL_AUTH_DISABLED');
    });
});

async function requestPublic(handler: (context: any) => Promise<Response>, body: Record<string, unknown>): Promise<Response> {
    const app = new Hono();
    app.post('/target', handler);
    app.onError(errorHandler);

    return await app.request('/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function requestProtected(token: string): Promise<Response> {
    const app = new Hono();
    app.use('*', authValidatorMiddleware);
    app.get('/target', (c) => c.json({ success: true }));
    app.onError(errorHandler);

    return await app.request('/target', {
        headers: { Authorization: `Bearer ${token}` },
    });
}

function errorHandler(error: Error, c: any): Response {
    if (error instanceof HttpError) {
        return c.json(error.toJSON(), error.statusCode);
    }
    return c.json({ success: false, error: String(error) }, 500);
}
