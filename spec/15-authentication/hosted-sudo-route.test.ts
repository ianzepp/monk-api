import { afterEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { HttpError } from '@src/lib/errors/http-error.js';
import SudoPost from '@src/routes/api/user/sudo/POST.js';

const originalEnv = { ...process.env };

describe('hosted sudo token issuance', () => {
    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('allows full users to mint sudo tokens in production', async () => {
        process.env.NODE_ENV = 'production';
        process.env.JWT_SECRET = 'hosted-sudo-secret';

        const response = await requestSudo({
            jwtPayload: {
                sub: 'user-1',
                user_id: 'user-1',
                username: 'fulluser',
                tenant: 'acme',
                tenant_id: 'tenant-1',
                db_type: 'sqlite',
                db: 'tenant-db',
                ns: 'tenant-ns',
                access: 'full',
                access_read: [],
                access_edit: [],
                access_full: [],
                iat: 1,
                exp: 9999999999,
            },
            user: {
                id: 'user-1',
                username: 'fulluser',
                tenant: 'acme',
                access: 'full',
                dbName: 'tenant-db',
                nsName: 'tenant-ns',
                access_read: [],
                access_edit: [],
                access_full: [],
            },
        });

        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.is_sudo).toBe(true);
        expect(body.data.sudo_token).toBeTruthy();
    });
});

async function requestSudo(contextData: { jwtPayload: Record<string, unknown>; user: Record<string, unknown> }): Promise<Response> {
    const app = new Hono();
    app.use('/target', async (c, next) => {
        const context = c as any;
        context.set('jwtPayload', contextData.jwtPayload);
        context.set('user', contextData.user);
        await next();
    });
    app.post('/target', SudoPost);
    app.onError((error: Error, c: any) => {
        if (error instanceof HttpError) {
            return c.json(error.toJSON(), error.statusCode);
        }
        return c.json({ success: false, error: String(error) }, 500);
    });

    return await app.request('/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Hosted sudo regression test' }),
    });
}
