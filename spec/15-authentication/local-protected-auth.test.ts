import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-local-protected');
process.env.JWT_SECRET = 'local-protected-secret';

const { HttpError } = await import('@src/lib/errors/http-error.js');
const {
    Infrastructure,
} = await import('@src/lib/infrastructure.js');
const {
    createAdapterFrom,
} = await import('@src/lib/database/index.js');
const {
    authValidatorMiddleware,
} = await import('@src/lib/middleware/auth-validator.js');

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;

describe('authValidatorMiddleware local protected request resolution', () => {
    beforeAll(async () => {
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        mkdirSync(TEMP_DATA_DIR, { recursive: true });
        await Infrastructure.resetForTests();
        await Infrastructure.initialize();
    });

    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.MONK_ENABLE_LOCAL_AUTH = 'true';
        delete process.env.AUTH0_ISSUER;
        delete process.env.AUTH0_DOMAIN;
        delete process.env.AUTH0_AUDIENCE;
        delete process.env.AUTH0_JWKS_URL;
    });

    afterAll(async () => {
        await Infrastructure.resetForTests();
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    });

    it('rejects inactive or deleted tenants for local HS256 protected requests', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `local_deleted_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
        });
        const token = await makeLocalToken({
            sub: user.id,
            user_id: user.id,
            username: user.auth,
            tenant: tenant.name,
            tenant_id: tenant.id,
            db_type: tenant.db_type,
            db: tenant.database,
            ns: tenant.schema,
            access: user.access,
        });

        await Infrastructure.deleteTenant(tenant.name);

        const response = await requestProtected(token);
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH_INVALID_TENANT');
    });

    it('falls back to tenant name when legacy local tokens do not carry tenant_id', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `local_legacy_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
        });
        const token = await makeLocalToken({
            sub: user.id,
            user_id: user.id,
            username: user.auth,
            tenant: tenant.name,
            db_type: tenant.db_type,
            db: 'forged-db',
            ns: 'forged-ns',
            access: user.access,
        });

        const response = await requestProtected(token);
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.tenant).toBe(tenant.name);
        expect(body.systemInit.tenantId).toBe(tenant.id);
        expect(body.systemInit.dbName).toBe(tenant.database);
        expect(body.systemInit.nsName).toBe(tenant.schema);
    });

    it('does not let local HS256 token routing claims choose db or namespace', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `local_routing_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
        });
        await updateTenantUser(tenant, user.id, `UPDATE users SET name = 'Local Routed User' WHERE id = $1`);
        const token = await makeLocalToken({
            sub: user.id,
            user_id: user.id,
            username: user.auth,
            tenant: 'evil-tenant',
            tenant_id: tenant.id,
            db_type: tenant.db_type,
            db: 'evil-db',
            ns: 'evil-ns',
            access: user.access,
        });

        const response = await requestProtected(token);
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.tenant).toBe(tenant.name);
        expect(body.systemInit.tenantId).toBe(tenant.id);
        expect(body.systemInit.dbName).toBe(tenant.database);
        expect(body.systemInit.nsName).toBe(tenant.schema);
        expect(body.user.id).toBe(user.id);
    });
});

async function makeLocalToken(input: {
    sub: string;
    user_id: string;
    username: string;
    tenant: string;
    tenant_id?: string;
    db_type: 'sqlite' | 'postgresql';
    db: string;
    ns: string;
    access: string;
}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return await sign({
        ...input,
        access_read: [],
        access_edit: [],
        access_full: [],
        iat: now,
        exp: now + 600,
        is_sudo: input.access === 'root',
    }, process.env.JWT_SECRET!, 'HS256');
}

async function requestProtected(token: string): Promise<Response> {
    const app = new Hono();
    app.use('*', authValidatorMiddleware);
    app.get('/protected', (c) => {
        const context = c as any;
        return c.json({
            systemInit: context.get('systemInit'),
            jwtPayload: context.get('jwtPayload'),
            user: context.get('user'),
        });
    });
    app.onError((error, c) => {
        if (error instanceof HttpError) {
            return c.json(error.toJSON(), error.statusCode as 401);
        }
        return c.json({ success: false, error: String(error) }, 500);
    });

    return await app.request('/protected', {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
}

async function updateTenantUser(
    tenant: { db_type: 'sqlite' | 'postgresql'; database: string; schema: string },
    userId: string,
    sql: string
): Promise<void> {
    const adapter = createAdapterFrom(tenant.db_type, tenant.database, tenant.schema);
    await adapter.connect();
    try {
        await adapter.query(sql, [userId]);
    } finally {
        await adapter.disconnect();
    }
}
