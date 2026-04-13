import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-auth0-mapping');

const {
    Infrastructure,
} = await import('@src/lib/infrastructure.js');
const {
    Auth0IdentityMappingError,
    auth0UserAuthValue,
    createAuth0IdentityMapping,
    resolveAuth0Identity,
} = await import('@src/lib/auth0/index.js');

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;

describe('Auth0 identity mappings', () => {
    beforeAll(async () => {
        rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        mkdirSync(TEMP_DATA_DIR, { recursive: true });
        await Infrastructure.resetForTests();
        await Infrastructure.initialize();
    });

    afterAll(async () => {
        await Infrastructure.resetForTests();
        if (existsSync(TEMP_DATA_DIR)) {
            rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
        }
    });

    it('creates and resolves a verified Auth0 issuer and subject to Monk tenant and user rows', async () => {
        const { tenant, user } = await createTenant();
        const mapping = await createAuth0IdentityMapping({
            issuer: 'https://issuer-a.example',
            subject: 'auth0|user_a',
            tenantId: tenant.id,
            userId: user.id,
        });

        expect(mapping.issuer).toBe('https://issuer-a.example/');
        expect(mapping.subject).toBe('auth0|user_a');
        expect(mapping.tenant_id).toBe(tenant.id);
        expect(mapping.user_id).toBe(user.id);

        const resolved = await resolveAuth0Identity('https://issuer-a.example/', 'auth0|user_a');
        expect(resolved.tenant.id).toBe(tenant.id);
        expect(resolved.user.id).toBe(user.id);
        expect(resolved.user.access).toBe('root');
    });

    it('rejects duplicate issuer and subject mappings', async () => {
        const { tenant, user } = await createTenant();
        const input = {
            issuer: 'https://issuer-b.example/',
            subject: 'auth0|duplicate',
            tenantId: tenant.id,
            userId: user.id,
        };

        await createAuth0IdentityMapping(input);

        try {
            await createAuth0IdentityMapping(input);
            throw new Error('Expected duplicate mapping to fail');
        } catch (error) {
            expect(error).toBeInstanceOf(Auth0IdentityMappingError);
            expect((error as { code: string }).code).toBe('AUTH0_MAPPING_DUPLICATE');
        }
    });

    it('distinguishes missing mappings from invalid tokens', async () => {
        try {
            await resolveAuth0Identity('https://issuer-c.example/', 'auth0|missing');
            throw new Error('Expected missing mapping to fail');
        } catch (error) {
            expect(error).toBeInstanceOf(Auth0IdentityMappingError);
            expect((error as { code: string }).code).toBe('AUTH0_PROVISIONING_REQUIRED');
        }
    });

    it('allows the same subject under different issuers', async () => {
        const first = await createTenant();
        const second = await createTenant();
        const subject = 'auth0|shared-subject';

        await createAuth0IdentityMapping({
            issuer: 'https://issuer-d-one.example/',
            subject,
            tenantId: first.tenant.id,
            userId: first.user.id,
        });
        await createAuth0IdentityMapping({
            issuer: 'https://issuer-d-two.example/',
            subject,
            tenantId: second.tenant.id,
            userId: second.user.id,
        });

        const resolvedFirst = await resolveAuth0Identity('https://issuer-d-one.example/', subject);
        const resolvedSecond = await resolveAuth0Identity('https://issuer-d-two.example/', subject);

        expect(resolvedFirst.tenant.id).toBe(first.tenant.id);
        expect(resolvedSecond.tenant.id).toBe(second.tenant.id);
    });

    it('derives a tenant-local users.auth label without profile or organization claims', () => {
        const value = auth0UserAuthValue('https://issuer-e.example', 'auth0|user_e');

        expect(value).toMatch(/^auth0:[a-f0-9]{32}$/);
        expect(value).toBe(auth0UserAuthValue('https://issuer-e.example/', 'auth0|user_e'));
    });
});

async function createTenant() {
    return await Infrastructure.createTenant({
        name: `auth0_mapping_${Date.now()}_${randomUUID().slice(0, 8)}`,
        db_type: 'sqlite',
    });
}
