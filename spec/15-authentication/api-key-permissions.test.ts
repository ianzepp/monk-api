import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-api-key-permissions');

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
const {
    generateApiKey,
} = await import('@src/lib/credentials/index.js');

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;

describe('authValidatorMiddleware API key permissions', () => {
    beforeAll(async () => {
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        mkdirSync(TEMP_DATA_DIR, { recursive: true });
        await Infrastructure.resetForTests();
        await Infrastructure.initialize();
    });

    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        delete process.env.AUTH0_ISSUER;
        delete process.env.AUTH0_DOMAIN;
        delete process.env.AUTH0_AUDIENCE;
        delete process.env.AUTH0_JWKS_URL;
        delete process.env.MONK_ENABLE_LOCAL_AUTH;
    });

    afterAll(async () => {
        await Infrastructure.resetForTests();
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    });

    it('clamps a root-owned API key to read-only access when permissions.access=read', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `api_key_read_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
        });
        const key = await createApiKeyCredential(tenant, user.id, {
            access: 'read',
        });

        const response = await requestProtected(key.key, tenant.name);
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.access).toBe('read');
        expect(body.user.access).toBe('read');
        expect(body.systemInit.isSudoToken).toBe(false);
        expect(body.jwtPayload.is_sudo).toBe(false);
        expect(body.jwtPayload.is_api_key).toBe(true);
    });

    it('does not grant automatic sudo to a root-owned API key without explicit sudo permission', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `api_key_root_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
        });
        const key = await createApiKeyCredential(tenant, user.id);

        const response = await requestProtected(key.key, tenant.name);
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.access).toBe('full');
        expect(body.user.access).toBe('full');
        expect(body.systemInit.isSudoToken).toBe(false);
        expect(body.jwtPayload.is_sudo).toBe(false);
    });

    it('allows explicit sudo only when the key permission requests it', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `api_key_sudo_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
        });
        const key = await createApiKeyCredential(tenant, user.id, {
            access: 'root',
            sudo: true,
        });

        const response = await requestProtected(key.key, tenant.name);
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.access).toBe('root');
        expect(body.user.access).toBe('root');
        expect(body.systemInit.isSudoToken).toBe(true);
        expect(body.jwtPayload.is_sudo).toBe(true);
    });

    it('recomputes API key privilege from the current owner role after downgrade', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `api_key_downgrade_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
        });
        const key = await createApiKeyCredential(tenant, user.id, {
            access: 'full',
            sudo: true,
        });

        await updateTenantUser(tenant, user.id, `UPDATE users SET access = 'read' WHERE id = $1`);

        const response = await requestProtected(key.key, tenant.name);
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.access).toBe('read');
        expect(body.user.access).toBe('read');
        expect(body.systemInit.isSudoToken).toBe(false);
        expect(body.jwtPayload.is_sudo).toBe(false);
    });

    it('rejects expired API keys', async () => {
        const { tenant, user } = await Infrastructure.createTenant({
            name: `api_key_expired_${Date.now()}_${randomUUID().slice(0, 8)}`,
            db_type: 'sqlite',
        });
        const key = await createApiKeyCredential(tenant, user.id, undefined, new Date(Date.now() - 60_000).toISOString());

        const response = await requestProtected(key.key, tenant.name);
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH_API_KEY_EXPIRED');
    });
});

async function createApiKeyCredential(
    tenant: { db_type: 'sqlite' | 'postgresql'; database: string; schema: string; name: string },
    userId: string,
    permissions?: Record<string, unknown>,
    expiresAt?: string
): Promise<{ key: string; prefix: string }> {
    const generated = generateApiKey('dev');
    const adapter = createAdapterFrom(tenant.db_type, tenant.database, tenant.schema);
    await adapter.connect();
    try {
        await adapter.query(
            `INSERT INTO credentials (id, user_id, type, identifier, secret, algorithm, permissions, name, expires_at, created_at, updated_at)
             VALUES ($1, $2, 'api_key', $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
                randomUUID(),
                userId,
                generated.prefix,
                generated.hash,
                generated.algorithm,
                permissions ? JSON.stringify(permissions) : null,
                'test-key',
                expiresAt || null,
            ]
        );
    } finally {
        await adapter.disconnect();
    }

    return { key: generated.key, prefix: generated.prefix };
}

async function requestProtected(apiKey: string, tenantName: string): Promise<Response> {
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
            'X-API-Key': apiKey,
            'X-Tenant': tenantName,
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
