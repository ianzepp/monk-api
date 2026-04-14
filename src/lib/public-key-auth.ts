import { createHash, createPublicKey, randomBytes, randomUUID, verify as verifySignature } from 'crypto';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { Infrastructure, type TenantRecord } from '@src/lib/infrastructure.js';
import { createAdapterFrom } from '@src/lib/database/index.js';
import { JWTGenerator, type JWTPayload } from '@src/lib/jwt-generator.js';
import { AUTH_CHALLENGE_EXPIRY, JWT_PUBLIC_KEY_EXPIRY } from '@src/lib/constants.js';
import type { System } from '@src/lib/system.js';

type SupportedKeyAlgorithm = 'ed25519';

interface TenantUserRow {
    id: string;
    auth: string;
    access: string;
    access_read?: string[];
    access_edit?: string[];
    access_full?: string[];
}

interface TenantKeyRow {
    id: string;
    user_id: string;
    name: string | null;
    algorithm: SupportedKeyAlgorithm;
    public_key: string;
    fingerprint: string;
    created_at: string;
    updated_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
}

interface ChallengeRow {
    id: string;
    key_id: string;
    nonce: string;
    algorithm: SupportedKeyAlgorithm;
    issued_at: string;
    expires_at: string;
    used_at: string | null;
}

interface ChallengeWithKeyRow extends KeyWithUserRow {
    challenge_id: string;
    challenge_nonce: string;
    challenge_algorithm: SupportedKeyAlgorithm;
    challenge_issued_at: string;
    challenge_expires_at: string;
    challenge_used_at: string | null;
}

interface KeyWithUserRow extends TenantKeyRow {
    auth: string;
    access: string;
    access_read?: string[];
    access_edit?: string[];
    access_full?: string[];
}

export interface ProvisionRequest {
    tenant?: string;
    username?: string;
    public_key?: string;
    algorithm?: string;
    key_name?: string;
}

export interface ProvisionResult {
    tenant: string;
    tenant_id: string;
    user: {
        id: string;
        username: string;
        access: string;
    };
    key: {
        id: string;
        name: string | null;
        algorithm: SupportedKeyAlgorithm;
        fingerprint: string;
    };
    challenge: {
        challenge_id: string;
        nonce: string;
        expires_in: number;
    };
}

export interface ChallengeRequest {
    tenant?: string;
    key_id?: string;
    fingerprint?: string;
}

export interface ChallengeResult {
    challenge_id: string;
    nonce: string;
    issued_at: string;
    expires_in: number;
    algorithm: SupportedKeyAlgorithm;
}

export interface VerifyRequest {
    tenant?: string;
    challenge_id?: string;
    signature?: string;
}

export interface VerifyResult {
    token: string;
    expires_in: number;
    tenant: string;
    tenant_id: string;
    key_id: string;
}

export interface KeyListItem {
    id: string;
    user_id: string;
    name: string | null;
    algorithm: SupportedKeyAlgorithm;
    fingerprint: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
}

export interface AddKeyRequest {
    user_id?: string;
    public_key?: string;
    algorithm?: string;
    name?: string;
    expires_at?: string | null;
}

export interface AddKeyResult {
    id: string;
    user_id: string;
    name: string | null;
    algorithm: SupportedKeyAlgorithm;
    fingerprint: string;
    created_at: string;
    expires_at: string | null;
}

export interface RotateKeyRequest {
    key_id?: string;
    new_public_key?: string;
    algorithm?: string;
    new_name?: string;
    revoke_old_after_seconds?: number;
}

export interface RotateKeyResult {
    old_key_id: string;
    new_key_id: string;
    revokes_at: string;
}

const CANONICAL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

const SQLITE_AUTH_TABLES_DDL = [
    `CREATE TABLE IF NOT EXISTS "tenant_keys" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "tenant_id" TEXT,
        "user_id" TEXT NOT NULL,
        "name" TEXT,
        "algorithm" TEXT NOT NULL CHECK ("algorithm" IN ('ed25519')),
        "public_key" TEXT NOT NULL,
        "fingerprint" TEXT NOT NULL,
        "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "last_used_at" TEXT,
        "expires_at" TEXT,
        "revoked_at" TEXT,
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_keys_fingerprint" ON "tenant_keys" ("fingerprint")`,
    `CREATE INDEX IF NOT EXISTS "idx_tenant_keys_user" ON "tenant_keys" ("user_id", "created_at" DESC)`,
    `CREATE TABLE IF NOT EXISTS "auth_challenges" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "key_id" TEXT NOT NULL REFERENCES "tenant_keys"("id") ON DELETE CASCADE,
        "nonce" TEXT NOT NULL,
        "algorithm" TEXT NOT NULL CHECK ("algorithm" IN ('ed25519')),
        "issued_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "expires_at" TEXT NOT NULL,
        "used_at" TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS "idx_auth_challenges_key" ON "auth_challenges" ("key_id", "issued_at" DESC)`,
];

const POSTGRES_AUTH_TABLES_DDL = [
    `CREATE TABLE IF NOT EXISTS "tenant_keys" (
        "id" uuid PRIMARY KEY NOT NULL,
        "tenant_id" uuid,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" text,
        "algorithm" text NOT NULL CHECK ("algorithm" IN ('ed25519')),
        "public_key" text NOT NULL,
        "fingerprint" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "last_used_at" timestamp,
        "expires_at" timestamp,
        "revoked_at" timestamp
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_keys_fingerprint" ON "tenant_keys" ("fingerprint")`,
    `CREATE INDEX IF NOT EXISTS "idx_tenant_keys_user" ON "tenant_keys" ("user_id", "created_at" DESC)`,
    `CREATE TABLE IF NOT EXISTS "auth_challenges" (
        "id" uuid PRIMARY KEY NOT NULL,
        "key_id" uuid NOT NULL REFERENCES "tenant_keys"("id") ON DELETE CASCADE,
        "nonce" text NOT NULL,
        "algorithm" text NOT NULL CHECK ("algorithm" IN ('ed25519')),
        "issued_at" timestamp DEFAULT now() NOT NULL,
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp
    )`,
    `CREATE INDEX IF NOT EXISTS "idx_auth_challenges_key" ON "auth_challenges" ("key_id", "issued_at" DESC)`,
];

export async function provisionTenantWithKey(request: ProvisionRequest): Promise<ProvisionResult> {
    const tenant = request.tenant?.trim();
    const username = request.username?.trim();
    const algorithm = normalizeAlgorithm(request.algorithm);

    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'AUTH_TENANT_MISSING');
    }
    if (!CANONICAL_NAME_PATTERN.test(tenant)) {
        throw HttpErrors.badRequest(canonicalNameMessage('Tenant'), 'AUTH_TENANT_INVALID');
    }
    if (!username) {
        throw HttpErrors.badRequest('Username is required', 'AUTH_USERNAME_MISSING');
    }
    if (!CANONICAL_NAME_PATTERN.test(username)) {
        throw HttpErrors.badRequest(canonicalNameMessage('Username'), 'AUTH_USERNAME_INVALID');
    }
    const normalizedKey = normalizePublicKey(request.public_key, algorithm);

    const existingTenant = await Infrastructure.getTenantWithStatuses(
        tenant,
        ['pending', 'active', 'suspended', 'dissolving', 'deleted']
    );
    if (existingTenant) {
        throw HttpErrors.conflict(`Tenant '${tenant}' already exists`, 'DATABASE_TENANT_EXISTS');
    }

    let createdTenant: TenantRecord | null = null;
    try {
        const result = await Infrastructure.createTenant({
            name: tenant,
            owner_username: username,
            status: 'pending',
        });
        createdTenant = result.tenant;
        await ensureTenantAuthTables(result.tenant);
        const key = await insertTenantKey(result.tenant, {
            user_id: result.user.id,
            public_key: normalizedKey.pem,
            fingerprint: normalizedKey.fingerprint,
            algorithm,
            name: request.key_name?.trim() || null,
            expires_at: null,
        });
        const challenge = await createChallenge(result.tenant, key.id, algorithm);
        return {
            tenant: result.tenant.name,
            tenant_id: result.tenant.id,
            user: {
                id: result.user.id,
                username: result.user.auth,
                access: result.user.access,
            },
            key: {
                id: key.id,
                name: key.name,
                algorithm: key.algorithm,
                fingerprint: key.fingerprint,
            },
            challenge: {
                challenge_id: challenge.id,
                nonce: challenge.nonce,
                expires_in: AUTH_CHALLENGE_EXPIRY,
            },
        };
    } catch (error) {
        if (createdTenant) {
            await Infrastructure.deleteTenant(createdTenant.name);
        }
        throw error;
    }
}

export async function createTenantChallenge(request: ChallengeRequest): Promise<ChallengeResult> {
    const tenant = await requireMachineAuthTenant(request.tenant);
    await ensureTenantAuthTables(tenant);

    const key = await resolveTenantKey(tenant, request.key_id, request.fingerprint);
    if (!key) {
        throw HttpErrors.unauthorized('Key not found', 'AUTH_KEY_NOT_FOUND');
    }
    assertKeyUsable(key);

    const challenge = await createChallenge(tenant, key.id, key.algorithm);
    return {
        challenge_id: challenge.id,
        nonce: challenge.nonce,
        issued_at: challenge.issued_at,
        expires_in: AUTH_CHALLENGE_EXPIRY,
        algorithm: challenge.algorithm,
    };
}

export async function verifyTenantChallenge(request: VerifyRequest): Promise<VerifyResult> {
    const tenant = await requireMachineAuthTenant(request.tenant);
    await ensureTenantAuthTables(tenant);

    const challengeId = request.challenge_id?.trim();
    if (!challengeId) {
        throw HttpErrors.badRequest('Challenge ID is required', 'AUTH_CHALLENGE_MISSING');
    }
    const signature = request.signature?.trim();
    if (!signature) {
        throw HttpErrors.badRequest('Signature is required', 'AUTH_SIGNATURE_MISSING');
    }

    const keyChallenge = await getChallengeWithKey(tenant, challengeId);
    if (!keyChallenge) {
        throw HttpErrors.unauthorized('Challenge is invalid', 'AUTH_CHALLENGE_INVALID');
    }
    assertKeyUsable(keyChallenge);
    if (isExpired(keyChallenge.challenge_expires_at)) {
        throw HttpErrors.unauthorized('Challenge has expired', 'AUTH_CHALLENGE_EXPIRED');
    }
    if (keyChallenge.challenge_used_at) {
        throw HttpErrors.unauthorized('Challenge has already been used', 'AUTH_CHALLENGE_INVALID');
    }

    const keyObject = createPublicKey(keyChallenge.public_key);
    const ok = verifySignature(
        null,
        Buffer.from(keyChallenge.challenge_nonce, 'utf8'),
        keyObject,
        decodeBase64Url(signature)
    );
    if (!ok) {
        throw HttpErrors.unauthorized('Signature is invalid', 'AUTH_SIGNATURE_INVALID');
    }

    const consumed = await consumeChallenge(tenant, challengeId);
    if (!consumed) {
        throw HttpErrors.unauthorized('Challenge is invalid', 'AUTH_CHALLENGE_INVALID');
    }

    const user = await getTenantUserById(tenant, keyChallenge.user_id);
    if (!user) {
        throw HttpErrors.unauthorized('Key not found', 'AUTH_KEY_NOT_FOUND');
    }

    await touchKey(tenant, keyChallenge.id);
    if (tenant.status === 'pending') {
        await Infrastructure.updateTenantStatus(tenant.id, 'active');
        tenant.status = 'active';
        tenant.is_active = true;
    }

    const payload: JWTPayload = {
        sub: user.id,
        user_id: user.id,
        username: user.auth,
        tenant: tenant.name,
        tenant_id: tenant.id,
        db_type: tenant.db_type,
        db: tenant.database,
        ns: tenant.schema,
        access: user.access,
        access_read: parseAccessArray(user.access_read),
        access_edit: parseAccessArray(user.access_edit),
        access_full: parseAccessArray(user.access_full),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + JWT_PUBLIC_KEY_EXPIRY,
        is_sudo: user.access === 'root',
        auth_type: 'public_key',
        key_id: keyChallenge.id,
        key_fingerprint: keyChallenge.fingerprint,
    };
    const token = await JWTGenerator.signPayload(payload);

    return {
        token,
        expires_in: JWT_PUBLIC_KEY_EXPIRY,
        tenant: tenant.name,
        tenant_id: tenant.id,
        key_id: keyChallenge.id,
    };
}

export async function listTenantKeys(system: System): Promise<KeyListItem[]> {
    requireRootOrFull(system);
    await ensureTenantAuthTablesFromSystem(system);
    const result = await system.database.execute(
        `SELECT id, user_id, name, algorithm, fingerprint, created_at, last_used_at, expires_at, revoked_at
         FROM tenant_keys
         ORDER BY created_at ASC`
    );
    return (result.rows || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        name: row.name ?? null,
        algorithm: row.algorithm,
        fingerprint: row.fingerprint,
        created_at: row.created_at,
        last_used_at: row.last_used_at ?? null,
        expires_at: row.expires_at ?? null,
        revoked_at: row.revoked_at ?? null,
    }));
}

export async function addTenantKey(system: System, request: AddKeyRequest): Promise<AddKeyResult> {
    requireRootOrFull(system);
    await ensureTenantAuthTablesFromSystem(system);

    const userId = request.user_id?.trim();
    if (!userId) {
        throw HttpErrors.badRequest('User ID is required', 'AUTH_USER_ID_MISSING');
    }
    const user = await system.database.execute(
        `SELECT id FROM users WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL`,
        [userId]
    );
    if (!user.rows?.[0]) {
        throw HttpErrors.notFound('User not found', 'USER_NOT_FOUND');
    }

    const algorithm = normalizeAlgorithm(request.algorithm);
    const normalizedKey = normalizePublicKey(request.public_key, algorithm);
    await assertKeyNotDuplicate(system, normalizedKey.fingerprint);

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await system.database.execute(
        `INSERT INTO tenant_keys (id, tenant_id, user_id, name, algorithm, public_key, fingerprint, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)`,
        [
            id,
            system.tenantId || null,
            userId,
            request.name?.trim() || null,
            algorithm,
            normalizedKey.pem,
            normalizedKey.fingerprint,
            createdAt,
            normalizeOptionalTimestamp(request.expires_at),
        ]
    );
    return {
        id,
        user_id: userId,
        name: request.name?.trim() || null,
        algorithm,
        fingerprint: normalizedKey.fingerprint,
        created_at: createdAt,
        expires_at: normalizeOptionalTimestamp(request.expires_at),
    };
}

export async function rotateTenantKey(system: System, request: RotateKeyRequest): Promise<RotateKeyResult> {
    requireRootOrFull(system);
    await ensureTenantAuthTablesFromSystem(system);

    const keyId = request.key_id?.trim();
    if (!keyId) {
        throw HttpErrors.badRequest('Key ID is required', 'AUTH_KEY_ID_MISSING');
    }
    const existing = await getTenantKeyById(system, keyId);
    if (!existing) {
        throw HttpErrors.unauthorized('Key not found', 'AUTH_KEY_NOT_FOUND');
    }
    assertKeyUsable(existing);

    const algorithm = normalizeAlgorithm(request.algorithm);
    const normalizedKey = normalizePublicKey(request.new_public_key, algorithm);
    await assertKeyNotDuplicate(system, normalizedKey.fingerprint, existing.id);

    const newId = randomUUID();
    const createdAt = new Date().toISOString();
    const revokeAfterSeconds = Math.max(0, Math.floor(request.revoke_old_after_seconds ?? 300));
    const revokesAt = new Date(Date.now() + revokeAfterSeconds * 1000).toISOString();

    await system.database.execute(
        `INSERT INTO tenant_keys (id, tenant_id, user_id, name, algorithm, public_key, fingerprint, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [
            newId,
            system.tenantId || null,
            existing.user_id,
            request.new_name?.trim() || null,
            algorithm,
            normalizedKey.pem,
            normalizedKey.fingerprint,
            createdAt,
        ]
    );
    await system.database.execute(
        `UPDATE tenant_keys SET revoked_at = $1, updated_at = $2 WHERE id = $3`,
        [revokesAt, createdAt, existing.id]
    );

    return {
        old_key_id: existing.id,
        new_key_id: newId,
        revokes_at: revokesAt,
    };
}

export async function revokeTenantKey(system: System, keyId: string): Promise<{ id: string; revoked: true }> {
    requireRootOrFull(system);
    await ensureTenantAuthTablesFromSystem(system);

    const existing = await getTenantKeyById(system, keyId);
    if (!existing) {
        throw HttpErrors.unauthorized('Key not found', 'AUTH_KEY_NOT_FOUND');
    }

    const activeCount = await system.database.execute(
        `SELECT COUNT(*) AS count
         FROM tenant_keys
         WHERE (revoked_at IS NULL OR revoked_at > $1)
           AND (expires_at IS NULL OR expires_at > $1)`,
        [new Date().toISOString()]
    );
    if (Number(activeCount.rows?.[0]?.count || 0) <= 1) {
        throw HttpErrors.forbidden(
            'Cannot revoke the last active key for this tenant',
            'AUTH_KEY_LAST_REVOKE_FORBIDDEN'
        );
    }

    await system.database.execute(
        `UPDATE tenant_keys SET revoked_at = $1, updated_at = $1 WHERE id = $2`,
        [new Date().toISOString(), existing.id]
    );
    return { id: existing.id, revoked: true };
}

export async function assertPublicKeyTokenUsable(tenant: TenantRecord, keyId: string): Promise<void> {
    await ensureTenantAuthTables(tenant);
    const result = await runTenantQuery<Pick<TenantKeyRow, 'id' | 'expires_at' | 'revoked_at'>>(
        tenant,
        `SELECT id, expires_at, revoked_at
         FROM tenant_keys
         WHERE id = $1
         LIMIT 1`,
        [keyId]
    );
    const key = result.rows[0];
    if (!key) {
        throw HttpErrors.unauthorized('Key not found', 'AUTH_KEY_NOT_FOUND');
    }
    assertKeyUsable(key);
}

async function requireMachineAuthTenant(tenantName?: string): Promise<TenantRecord> {
    const tenant = tenantName?.trim();
    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'AUTH_TENANT_MISSING');
    }
    if (!CANONICAL_NAME_PATTERN.test(tenant)) {
        throw HttpErrors.badRequest(canonicalNameMessage('Tenant'), 'AUTH_TENANT_INVALID');
    }
    const tenantRecord = await Infrastructure.getTenantWithStatuses(tenant, ['pending', 'active']);
    if (!tenantRecord) {
        throw HttpErrors.unauthorized('Invalid tenant', 'AUTH_LOGIN_FAILED');
    }
    return tenantRecord;
}

async function ensureTenantAuthTables(tenant: TenantRecord): Promise<void> {
    const adapter = createAdapterFrom(tenant.db_type, tenant.database, tenant.schema);
    await adapter.connect();
    try {
        const statements = tenant.db_type === 'sqlite' ? SQLITE_AUTH_TABLES_DDL : POSTGRES_AUTH_TABLES_DDL;
        for (const statement of statements) {
            await adapter.query(statement);
        }
    } finally {
        await adapter.disconnect();
    }
}

async function ensureTenantAuthTablesFromSystem(system: System): Promise<void> {
    const statements = system.dbType === 'sqlite' ? SQLITE_AUTH_TABLES_DDL : POSTGRES_AUTH_TABLES_DDL;
    for (const statement of statements) {
        await system.database.execute(statement);
    }
}

function normalizeAlgorithm(algorithm?: string): SupportedKeyAlgorithm {
    if (!algorithm) {
        return 'ed25519';
    }
    if (algorithm !== 'ed25519') {
        throw HttpErrors.badRequest('Unsupported key algorithm', 'AUTH_KEY_ALGORITHM_UNSUPPORTED');
    }
    return algorithm;
}

function normalizePublicKey(publicKey: string | undefined, algorithm: SupportedKeyAlgorithm) {
    if (!publicKey?.trim()) {
        throw HttpErrors.badRequest('Public key is required', 'AUTH_PUBLIC_KEY_MISSING');
    }
    if (algorithm !== 'ed25519') {
        throw HttpErrors.badRequest('Unsupported key algorithm', 'AUTH_KEY_ALGORITHM_UNSUPPORTED');
    }

    const source = publicKey.trim();
    try {
        const keyObject = source.includes('BEGIN PUBLIC KEY')
            ? createPublicKey(source)
            : createPublicKey({ key: Buffer.from(stripWhitespace(source), 'base64'), format: 'der', type: 'spki' });
        if (keyObject.asymmetricKeyType !== algorithm) {
            throw new Error(`Expected ${algorithm} public key`);
        }
        const pem = keyObject.export({ format: 'pem', type: 'spki' }).toString();
        const der = keyObject.export({ format: 'der', type: 'spki' }) as Buffer;
        const fingerprint = `fp_${createHash('sha256').update(der).digest('hex').slice(0, 32)}`;
        return { pem, fingerprint };
    } catch {
        throw HttpErrors.badRequest('Public key is invalid', 'AUTH_PUBLIC_KEY_INVALID');
    }
}

async function insertTenantKey(
    tenant: TenantRecord,
    input: {
        user_id: string;
        public_key: string;
        fingerprint: string;
        algorithm: SupportedKeyAlgorithm;
        name: string | null;
        expires_at: string | null;
    }
): Promise<TenantKeyRow> {
    const duplicate = await runTenantQuery<TenantKeyRow>(
        tenant,
        `SELECT id, user_id, name, algorithm, public_key, fingerprint, created_at, updated_at, last_used_at, expires_at, revoked_at
         FROM tenant_keys
         WHERE fingerprint = $1
           AND (revoked_at IS NULL OR revoked_at > $2)
           AND (expires_at IS NULL OR expires_at > $2)`,
        [input.fingerprint, new Date().toISOString()]
    );
    if (duplicate.rows[0]) {
        throw HttpErrors.conflict('Duplicate public key for tenant', 'AUTH_PUBLIC_KEY_DUPLICATE');
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await runTenantQuery(
        tenant,
        `INSERT INTO tenant_keys (id, tenant_id, user_id, name, algorithm, public_key, fingerprint, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)`,
        [id, tenant.id, input.user_id, input.name, input.algorithm, input.public_key, input.fingerprint, createdAt, input.expires_at]
    );

    return {
        id,
        user_id: input.user_id,
        name: input.name,
        algorithm: input.algorithm,
        public_key: input.public_key,
        fingerprint: input.fingerprint,
        created_at: createdAt,
        updated_at: createdAt,
        last_used_at: null,
        expires_at: input.expires_at,
        revoked_at: null,
    };
}

async function resolveTenantKey(
    tenant: TenantRecord,
    keyId?: string,
    fingerprint?: string
): Promise<TenantKeyRow | null> {
    if (!keyId?.trim() && !fingerprint?.trim()) {
        throw HttpErrors.badRequest('Key ID or fingerprint is required', 'AUTH_KEY_ID_MISSING');
    }
    const now = new Date().toISOString();
    const field = keyId?.trim() ? 'id' : 'fingerprint';
    const value = keyId?.trim() || fingerprint!.trim();
    const result = await runTenantQuery<TenantKeyRow>(
        tenant,
        `SELECT id, user_id, name, algorithm, public_key, fingerprint, created_at, updated_at, last_used_at, expires_at, revoked_at
         FROM tenant_keys
         WHERE ${field} = $1
         LIMIT 1`,
        [value]
    );
    const key = result.rows[0] || null;
    if (key && isExpired(key.expires_at, now)) {
        throw HttpErrors.unauthorized('Key has expired', 'AUTH_KEY_EXPIRED');
    }
    if (key && isRevoked(key.revoked_at, now)) {
        throw HttpErrors.unauthorized('Key has been revoked', 'AUTH_KEY_REVOKED');
    }
    return key;
}

async function createChallenge(
    tenant: TenantRecord,
    keyId: string,
    algorithm: SupportedKeyAlgorithm
): Promise<ChallengeRow> {
    const challengeId = randomUUID();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + AUTH_CHALLENGE_EXPIRY * 1000).toISOString();
    const nonce = randomBytes(32).toString('base64url');

    await runTenantQuery(
        tenant,
        `INSERT INTO auth_challenges (id, key_id, nonce, algorithm, issued_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [challengeId, keyId, nonce, algorithm, issuedAt, expiresAt]
    );

    return {
        id: challengeId,
        key_id: keyId,
        nonce,
        algorithm,
        issued_at: issuedAt,
        expires_at: expiresAt,
        used_at: null,
    };
}

async function getChallengeWithKey(tenant: TenantRecord, challengeId: string): Promise<ChallengeWithKeyRow | null> {
    const result = await runTenantQuery<ChallengeWithKeyRow>(
        tenant,
        `SELECT c.id AS challenge_id,
                c.nonce AS challenge_nonce,
                c.algorithm AS challenge_algorithm,
                c.issued_at AS challenge_issued_at,
                c.expires_at AS challenge_expires_at,
                c.used_at AS challenge_used_at,
                k.id,
                k.user_id,
                k.name,
                k.algorithm,
                k.public_key,
                k.fingerprint,
                k.created_at,
                k.updated_at,
                k.last_used_at,
                k.expires_at,
                k.revoked_at,
                u.auth, u.access, u.access_read, u.access_edit, u.access_full
         FROM auth_challenges c
         JOIN tenant_keys k ON k.id = c.key_id
         JOIN users u ON u.id = k.user_id
         WHERE c.id = $1
           AND u.trashed_at IS NULL
           AND u.deleted_at IS NULL
         LIMIT 1`,
        [challengeId]
    );
    return result.rows[0] || null;
}

async function consumeChallenge(tenant: TenantRecord, challengeId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await runTenantQuery(
        tenant,
        `UPDATE auth_challenges
         SET used_at = $1
         WHERE id = $2
           AND used_at IS NULL
           AND expires_at > $1`,
        [now, challengeId]
    );
    return Number(result.rowCount || 0) > 0;
}

async function touchKey(tenant: TenantRecord, keyId: string): Promise<void> {
    await runTenantQuery(
        tenant,
        `UPDATE tenant_keys SET last_used_at = $1, updated_at = $1 WHERE id = $2`,
        [new Date().toISOString(), keyId]
    );
}

async function getTenantUserById(tenant: TenantRecord, userId: string): Promise<TenantUserRow | null> {
    const result = await runTenantQuery<TenantUserRow>(
        tenant,
        `SELECT id, auth, access, access_read, access_edit, access_full
         FROM users
         WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL`,
        [userId]
    );
    return result.rows[0] || null;
}

function parseAccessArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value as string[];
    }
    if (typeof value === 'string' && value) {
        return JSON.parse(value) as string[];
    }
    return [];
}

function decodeBase64Url(value: string): Buffer {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64');
}

function canonicalNameMessage(label: string): string {
    return `${label} must be snake_case, start with a letter, and contain only lowercase letters, numbers, and underscores`;
}

function isExpired(timestamp: string | null, now = new Date().toISOString()): boolean {
    return Boolean(timestamp && new Date(timestamp) <= new Date(now));
}

function isRevoked(timestamp: string | null, now = new Date().toISOString()): boolean {
    return Boolean(timestamp && new Date(timestamp) <= new Date(now));
}

function assertKeyUsable(key: Pick<TenantKeyRow, 'expires_at' | 'revoked_at'>): void {
    if (isRevoked(key.revoked_at)) {
        throw HttpErrors.unauthorized('Key has been revoked', 'AUTH_KEY_REVOKED');
    }
    if (isExpired(key.expires_at)) {
        throw HttpErrors.unauthorized('Key has expired', 'AUTH_KEY_EXPIRED');
    }
}

function requireRootOrFull(system: System): void {
    if (system.access !== 'root' && system.access !== 'full') {
        throw HttpErrors.forbidden('Key management requires root or full access', 'AUTH_KEYS_FORBIDDEN');
    }
}

function normalizeOptionalTimestamp(value?: string | null): string | null {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw HttpErrors.badRequest('expires_at must be a valid timestamp', 'AUTH_EXPIRES_AT_INVALID');
    }
    return date.toISOString();
}

async function assertKeyNotDuplicate(system: System, fingerprint: string, exceptId?: string): Promise<void> {
    const now = new Date().toISOString();
    const result = exceptId
        ? await system.database.execute(
            `SELECT id
             FROM tenant_keys
             WHERE fingerprint = $1
               AND id <> $2
               AND (revoked_at IS NULL OR revoked_at > $3)
               AND (expires_at IS NULL OR expires_at > $3)
             LIMIT 1`,
            [fingerprint, exceptId, now]
        )
        : await system.database.execute(
            `SELECT id
             FROM tenant_keys
             WHERE fingerprint = $1
               AND (revoked_at IS NULL OR revoked_at > $2)
               AND (expires_at IS NULL OR expires_at > $2)
             LIMIT 1`,
            [fingerprint, now]
        );
    if (result.rows?.[0]) {
        throw HttpErrors.conflict('Duplicate public key for tenant', 'AUTH_PUBLIC_KEY_DUPLICATE');
    }
}

async function getTenantKeyById(system: System, keyId: string): Promise<TenantKeyRow | null> {
    const result = await system.database.execute(
        `SELECT id, user_id, name, algorithm, public_key, fingerprint, created_at, updated_at, last_used_at, expires_at, revoked_at
         FROM tenant_keys
         WHERE id = $1`,
        [keyId]
    );
    return result.rows?.[0] || null;
}

async function runTenantQuery<T = any>(tenant: TenantRecord, query: string, params: any[] = []) {
    const adapter = createAdapterFrom(tenant.db_type, tenant.database, tenant.schema);
    await adapter.connect();
    try {
        return await adapter.query<T>(query, params);
    } finally {
        await adapter.disconnect();
    }
}

function stripWhitespace(value: string): string {
    return value.replace(/\s+/g, '');
}
