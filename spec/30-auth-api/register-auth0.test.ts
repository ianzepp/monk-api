import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-register-auth0');
process.env.AUTH0_ISSUER = 'https://register-test.example/';
process.env.AUTH0_AUDIENCE = 'https://api.register.test';
process.env.AUTH0_JWKS_URL = 'https://register-test.example/.well-known/jwks.json';

const { HttpError } = await import('@src/lib/errors/http-error.js');
const { Infrastructure } = await import('@src/lib/infrastructure.js');
const {
    Auth0VerificationError,
    getAuth0IdentityMapping,
    resolveAuth0Identity,
} = await import('@src/lib/auth0/index.js');
const RegisterPostModule = await import('@src/routes/auth/register/POST.js');

const RegisterPost = RegisterPostModule.default;
const { setAuth0RegisterVerifierFactoryForTests } = RegisterPostModule;

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;
const ISSUER = process.env.AUTH0_ISSUER as string;

describe('POST /auth/register - Auth0 tenant provisioning', () => {
    beforeAll(async () => {
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        mkdirSync(TEMP_DATA_DIR, { recursive: true });
        await Infrastructure.resetForTests();
        await Infrastructure.initialize();
    });

    beforeEach(() => {
        setRegisterSubject('auth0|default');
    });

    afterAll(async () => {
        setAuth0RegisterVerifierFactoryForTests(null);
        await Infrastructure.resetForTests();
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    });

    it('provisions a new tenant with a valid Auth0 token and records the mapping', async () => {
        const subject = `auth0|new-${randomUUID()}`;
        setRegisterSubject(subject);

        const response = await requestRegister({
            tenant: `register_auth0_${Date.now()}_${randomUUID().slice(0, 8)}`,
            adapter: 'sqlite',
        });
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.data.tenant_id).toBeDefined();
        expect(body.data.mapping_id).toBeDefined();
        expect(body.data.username).toMatch(/^auth0:[a-f0-9]{32}$/);
        expect(body.data.token).toBeUndefined();
        expect(body.data.expires_in).toBeUndefined();

        const resolved = await resolveAuth0Identity(ISSUER, subject);
        expect(resolved.tenant.id).toBe(body.data.tenant_id);
        expect(resolved.user.id).toBeDefined();
        expect(resolved.user.access).toBe('root');
    });

    it('rejects duplicate tenant attempts without granting root to a new Auth0 subject', async () => {
        const tenantName = `register_auth0_duplicate_${Date.now()}_${randomUUID().slice(0, 8)}`;
        setRegisterSubject('auth0|first-duplicate');
        const first = await requestRegister({ tenant: tenantName, adapter: 'sqlite' });
        expect(first.status).toBe(200);

        setRegisterSubject('auth0|second-duplicate');
        const second = await requestRegister({ tenant: tenantName, adapter: 'sqlite' });
        const body = await second.json() as any;

        expect(second.status).toBe(409);
        expect(body.error_code).toBe('DATABASE_TENANT_EXISTS');
        const mapping = await getAuth0IdentityMapping(ISSUER, 'auth0|second-duplicate');
        expect(mapping).toBeNull();
    });

    it('rejects registration without an Auth0 bearer token', async () => {
        const response = await requestRegister({ tenant: 'missing_token' }, null);
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH_TOKEN_REQUIRED');
    });

    it('rejects registration when Auth0 token verification fails', async () => {
        setAuth0RegisterVerifierFactoryForTests(() => ({
            verifyAccessToken: async () => {
                throw new Auth0VerificationError('Invalid Auth0 token signature', 'AUTH0_TOKEN_SIGNATURE_INVALID');
            },
        }));

        const response = await requestRegister({ tenant: 'invalid_token' });
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.error_code).toBe('AUTH0_TOKEN_SIGNATURE_INVALID');
    });

    it('rejects an Auth0 identity that was already provisioned', async () => {
        const subject = `auth0|already-${randomUUID()}`;
        setRegisterSubject(subject);
        const first = await requestRegister({
            tenant: `register_auth0_existing_${Date.now()}_${randomUUID().slice(0, 8)}`,
            adapter: 'sqlite',
        });
        expect(first.status).toBe(200);

        const second = await requestRegister({
            tenant: `register_auth0_existing_again_${Date.now()}_${randomUUID().slice(0, 8)}`,
            adapter: 'sqlite',
        });
        const body = await second.json() as any;

        expect(second.status).toBe(409);
        expect(body.error_code).toBe('AUTH0_IDENTITY_ALREADY_PROVISIONED');
    });
});

function setRegisterSubject(subject: string): void {
    setAuth0RegisterVerifierFactoryForTests(() => ({
        verifyAccessToken: async () => ({
            iss: ISSUER,
            sub: subject,
            aud: process.env.AUTH0_AUDIENCE as string,
            iat: 1_800_000_000,
            exp: 1_800_000_600,
            kid: 'register-test-kid',
            alg: 'RS256',
        }),
    }));
}

async function requestRegister(body: Record<string, unknown>, token: string | null = 'valid-auth0-token'): Promise<Response> {
    const app = new Hono();
    app.post('/auth/register', RegisterPost);
    app.onError((error, c) => {
        if (error instanceof HttpError) {
            return c.json(error.toJSON(), error.statusCode as 400);
        }
        return c.json({ success: false, error: String(error) }, 500);
    });

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return await app.request('/auth/register', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}
