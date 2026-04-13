import { createHash, randomUUID } from 'crypto';
import { Infrastructure, type TenantRecord, type UserRecord } from '@src/lib/infrastructure.js';
import { createAdapterFrom } from '@src/lib/database/index.js';

export interface Auth0IdentityMapping {
    id: string;
    issuer: string;
    subject: string;
    tenant_id: string;
    user_id: string;
    created_at: string;
    updated_at: string;
}

export interface CreateAuth0IdentityMappingInput {
    issuer: string;
    subject: string;
    tenantId: string;
    userId: string;
}

export interface ResolvedAuth0Identity {
    mapping: Auth0IdentityMapping;
    tenant: TenantRecord;
    user: UserRecord;
}

export class Auth0IdentityMappingError extends Error {
    public readonly name = 'Auth0IdentityMappingError';

    constructor(
        message: string,
        public readonly code: string
    ) {
        super(message);
        Object.setPrototypeOf(this, Auth0IdentityMappingError.prototype);
    }
}

/**
 * Deterministic tenant-local users.auth value for Auth0-created users.
 *
 * This intentionally avoids email, profile, organization, or social-login data.
 * Auth0 identity is issuer-scoped, so the local label hashes issuer + subject.
 */
export function auth0UserAuthValue(issuer: string, subject: string): string {
    const digest = createHash('sha256')
        .update(`${normalizeIssuer(issuer)}\0${subject}`)
        .digest('hex')
        .slice(0, 32);
    return `auth0:${digest}`;
}

export async function createAuth0IdentityMapping(
    input: CreateAuth0IdentityMappingInput
): Promise<Auth0IdentityMapping> {
    const issuer = normalizeIssuer(input.issuer);
    const subject = input.subject.trim();
    if (!issuer || !subject || !input.tenantId || !input.userId) {
        throw new Auth0IdentityMappingError('Auth0 identity mapping input is incomplete', 'AUTH0_MAPPING_INVALID');
    }

    const tenant = await Infrastructure.getTenantById(input.tenantId);
    if (!tenant) {
        throw new Auth0IdentityMappingError('Mapped Monk tenant was not found', 'AUTH0_MAPPING_TENANT_NOT_FOUND');
    }

    const user = await getTenantUser(tenant, input.userId);
    if (!user) {
        throw new Auth0IdentityMappingError('Mapped Monk user was not found', 'AUTH0_MAPPING_USER_NOT_FOUND');
    }

    const adapter = await Infrastructure.getAdapter();
    await adapter.connect();
    try {
        await adapter.beginTransaction();
        const id = randomUUID();
        const timestamp = new Date().toISOString();
        try {
            await adapter.query(
                `INSERT INTO auth0_identity_mappings
                    (id, issuer, subject, tenant_id, user_id, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, issuer, subject, input.tenantId, input.userId, timestamp, timestamp]
            );
            await adapter.commit();
        } catch (error) {
            await adapter.rollback();
            if (isDuplicateMappingError(error)) {
                throw new Auth0IdentityMappingError(
                    'Auth0 identity mapping already exists',
                    'AUTH0_MAPPING_DUPLICATE'
                );
            }
            throw error;
        }

        const mapping = await getAuth0IdentityMapping(issuer, subject);
        if (!mapping) {
            throw new Auth0IdentityMappingError('Auth0 identity mapping was not persisted', 'AUTH0_MAPPING_NOT_CREATED');
        }
        return mapping;
    } finally {
        await adapter.disconnect();
    }
}

export async function getAuth0IdentityMapping(
    issuer: string,
    subject: string
): Promise<Auth0IdentityMapping | null> {
    const adapter = await Infrastructure.getAdapter();
    await adapter.connect();
    try {
        const result = await adapter.query<Auth0IdentityMapping>(
            `SELECT id, issuer, subject, tenant_id, user_id, created_at, updated_at
             FROM auth0_identity_mappings
             WHERE issuer = $1 AND subject = $2`,
            [normalizeIssuer(issuer), subject.trim()]
        );
        return result.rows[0] || null;
    } finally {
        await adapter.disconnect();
    }
}

export async function resolveAuth0Identity(
    issuer: string,
    subject: string
): Promise<ResolvedAuth0Identity> {
    const mapping = await getAuth0IdentityMapping(issuer, subject);
    if (!mapping) {
        throw new Auth0IdentityMappingError(
            'Auth0 identity has not been provisioned in Monk',
            'AUTH0_PROVISIONING_REQUIRED'
        );
    }

    const tenant = await Infrastructure.getTenantById(mapping.tenant_id);
    if (!tenant) {
        throw new Auth0IdentityMappingError('Mapped Monk tenant was not found', 'AUTH0_MAPPING_TENANT_NOT_FOUND');
    }

    const user = await getTenantUser(tenant, mapping.user_id);
    if (!user) {
        throw new Auth0IdentityMappingError('Mapped Monk user was not found', 'AUTH0_MAPPING_USER_NOT_FOUND');
    }

    return { mapping, tenant, user };
}

async function getTenantUser(tenant: TenantRecord, userId: string): Promise<UserRecord | null> {
    const adapter = createAdapterFrom(tenant.db_type, tenant.database, tenant.schema);
    await adapter.connect();
    try {
        const result = await adapter.query<UserRecord>(
            `SELECT id, name, auth, access
             FROM users
             WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL`,
            [userId]
        );
        return result.rows[0] || null;
    } finally {
        await adapter.disconnect();
    }
}

function normalizeIssuer(issuer: string): string {
    const trimmed = issuer.trim();
    if (!trimmed) {
        return '';
    }
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function isDuplicateMappingError(error: unknown): boolean {
    const message = String((error as Error).message ?? error).toLowerCase();
    return message.includes('duplicate key value violates unique constraint')
        || message.includes('unique constraint')
        || message.includes('sqlite_constraint')
        || message.includes('unique constraint failed');
}
