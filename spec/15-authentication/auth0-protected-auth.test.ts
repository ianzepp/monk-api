import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-auth0-protected');
process.env.AUTH0_ISSUER = 'https://protected-test.example/';
process.env.AUTH0_AUDIENCE = 'https://api.protected.test';
process.env.AUTH0_JWKS_URL = 'https://protected-test.example/.well-known/jwks.json';

const { HttpError } = await import('@src/lib/errors/http-error.js');
const {
    Infrastructure,
} = await import('@src/lib/infrastructure.js');
const {
    createAdapterFrom,
} = await import('@src/lib/database/index.js');
const {
    createAuth0IdentityMapping,
} = await import('@src/lib/auth0/index.js');
const {
    authValidatorMiddleware,
    setAuth0VerifierFactoryForTests,
} = await import('@src/lib/middleware/auth-validator.js');

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;
const ISSUER = process.env.AUTH0_ISSUER as string;

describe('authValidatorMiddleware Auth0 protected request resolution', () => {
    beforeAll(async () => {
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        mkdirSync(TEMP_DATA_DIR, { recursive: true });
        await Infrastructure.resetForTests();
        await Infrastructure.initialize();
    });

    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.AUTH0_ISSUER = ISSUER;
        process.env.AUTH0_AUDIENCE = 'https://api.protected.test';
        process.env.AUTH0_JWKS_URL = 'https://protected-test.example/.well-known/jwks.json';
    });

    afterAll(async () => {
        setAuth0VerifierFactoryForTests(null);
        await Infrastructure.resetForTests();
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    });

    it('accepts a valid mapped Auth0 token and builds context from Monk state', async () => {
        const { tenant, user } = await createTenantWithMapping('auth0|mapped');
        setVerifierSubject('auth0|mapped');

        const response = await requestProtected('token-with-ignored-claims');
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.dbName).toBe(tenant.database);
        expect(body.systemInit.nsName).toBe(tenant.schema);
        expect(body.systemInit.tenant).toBe(tenant.name);
        expect(body.systemInit.userId).toBe(user.id);
        expect(body.systemInit.access).toBe('root');
        expect(body.jwtPayload.auth0_subject).toBe('auth0|mapped');
    });

    it('rejects a valid Auth0 token without a Monk mapping as provisioning required', async () => {
        setVerifierSubject('auth0|missing');

        const response = await requestProtected('valid-auth0-token');
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH0_PROVISIONING_REQUIRED');
    });

    it('does not let bearer token content choose routing or access', async () => {
        const { tenant } = await createTenantWithMapping('auth0|malicious-routing');
        setVerifierSubject('auth0|malicious-routing');

        const response = await requestProtected('{"tenant":"evil","db":"evil","ns":"evil","access":"root"}');
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.tenant).toBe(tenant.name);
        expect(body.systemInit.dbName).toBe(tenant.database);
        expect(body.systemInit.nsName).toBe(tenant.schema);
    });

    it('rejects inactive or deleted tenants even when the Auth0 token is valid', async () => {
        const { tenant } = await createTenantWithMapping('auth0|deleted-tenant');
        await Infrastructure.deleteTenant(tenant.name);
        setVerifierSubject('auth0|deleted-tenant');

        const response = await requestProtected('valid-auth0-token');
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH0_MAPPING_TENANT_NOT_FOUND');
    });

    it('applies current user role on the next request after a downgrade', async () => {
        const { tenant, user } = await createTenantWithMapping('auth0|downgraded');
        setVerifierSubject('auth0|downgraded');

        await updateTenantUser(tenant, user.id, `UPDATE users SET access = 'read' WHERE id = $1`);

        const response = await requestProtected('valid-auth0-token');
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.systemInit.access).toBe('read');
        expect(body.user.access).toBe('read');
    });

    it('rejects deleted tenant-local users even when the Auth0 token is valid', async () => {
        const { tenant, user } = await createTenantWithMapping('auth0|deleted-user');
        await updateTenantUser(tenant, user.id, `UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`);
        setVerifierSubject('auth0|deleted-user');

        const response = await requestProtected('valid-auth0-token');
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH0_MAPPING_USER_NOT_FOUND');
    });

    it('rejects local HS256 Monk JWTs in production mode', async () => {
        setAuth0VerifierFactoryForTests(null);
        process.env.NODE_ENV = 'production';
        process.env.JWT_SECRET = 'local-secret';
        const token = await sign({ sub: 'local', exp: Math.floor(Date.now() / 1000) + 600 }, 'local-secret', 'HS256');

        const response = await requestProtected(token);
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH0_TOKEN_ALGORITHM_UNSUPPORTED');
    });
});

async function createTenantWithMapping(subject: string) {
    const result = await Infrastructure.createTenant({
        name: `auth0_protected_${Date.now()}_${randomUUID().slice(0, 8)}`,
        db_type: 'sqlite',
    });
    await createAuth0IdentityMapping({
        issuer: ISSUER,
        subject,
        tenantId: result.tenant.id,
        userId: result.user.id,
    });
    return result;
}

function setVerifierSubject(subject: string): void {
    setAuth0VerifierFactoryForTests(() => ({
        verifyAccessToken: async () => ({
            iss: ISSUER,
            sub: subject,
            aud: process.env.AUTH0_AUDIENCE as string,
            iat: 1_800_000_000,
            exp: 1_800_000_600,
            kid: 'test-kid',
            alg: 'RS256',
        }),
    }));
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
