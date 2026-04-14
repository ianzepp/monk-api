/**
 * Authentication Service
 *
 * Production auth is Monk-brokered username/password verification against Auth0.
 * Monk never stores passwords. Monk mints its own bearer tokens after successful
 * Auth0 verification and local tenant/user resolution.
 */

import { Infrastructure, type TenantRecord } from '@src/lib/infrastructure.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { createAdapterFrom } from '@src/lib/database/index.js';
import { JWTGenerator, type JWTPayload } from '@src/lib/jwt-generator.js';
import { systemInitFromJWT, type SystemInit } from '@src/lib/system.js';
import { Auth0BrokerError, auth0BrokerFromEnv, auth0ScopedIdentity } from '@src/lib/auth0/index.js';

const CANONICAL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Login request parameters
 */
export interface LoginRequest {
    tenant?: string;
    tenantId?: string;
    username: string;
    password?: string;
}

/**
 * Authenticated user data
 */
export interface AuthenticatedUser {
    id: string;
    username: string;
    tenant: string;
    tenantId: string;
    access: string;
    accessRead: string[];
    accessEdit: string[];
    accessFull: string[];
}

/**
 * Login result on success
 */
export interface LoginResult {
    success: true;
    user: AuthenticatedUser;
    token: string;
    payload: JWTPayload;
    systemInit: SystemInit;
}

/**
 * Login failure result
 */
export interface LoginFailure {
    success: false;
    error: string;
    errorCode: string;
}

/**
 * Authenticate a user with tenant, username, and password.
 */
export async function login(request: LoginRequest): Promise<LoginResult | LoginFailure> {
    const { tenant, tenantId, username, password } = request;

    if (!tenant && !tenantId) {
        return failure('Tenant is required', 'AUTH_TENANT_MISSING');
    }
    if (!username) {
        return failure('Username is required', 'AUTH_USERNAME_MISSING');
    }
    if (!password) {
        return failure('Password is required', 'AUTH_PASSWORD_MISSING');
    }
    if (tenant && !isCanonicalName(tenant)) {
        return failure(canonicalNameMessage('Tenant'), 'AUTH_TENANT_INVALID');
    }
    if (!isCanonicalName(username)) {
        return failure(canonicalNameMessage('Username'), 'AUTH_USERNAME_INVALID');
    }

    const tenantRecord = tenantId
        ? await Infrastructure.getTenantById(tenantId)
        : await Infrastructure.getTenant(tenant!);
    if (!tenantRecord) {
        return failure('Authentication failed', 'AUTH_LOGIN_FAILED');
    }

    const user = await getTenantUserByAuth(tenantRecord, username);
    if (!user) {
        return failure('Authentication failed', 'AUTH_LOGIN_FAILED');
    }

    try {
        const broker = auth0BrokerFromEnv();
        await broker.authenticateScopedIdentity(auth0ScopedIdentity(tenantRecord.name, username), password);
    } catch (error) {
        if (error instanceof Auth0BrokerError) {
            return failure(error.message, error.code);
        }
        throw error;
    }

    return await createLoginResult(tenantRecord, user);
}

/**
 * Registration request parameters
 */
export interface RegisterRequest {
    tenant: string;
    username?: string;
    password?: string;
}

/**
 * Registration result on success
 */
export interface RegisterResult {
    success: true;
    tenant: string;
    tenantId: string;
    username: string;
    token: string;
}

/**
 * Registration failure result
 */
export interface RegisterFailure {
    success: false;
    error: string;
    errorCode: string;
}

/**
 * Register a new tenant with an initial user.
 */
export async function register(
    request: RegisterRequest
): Promise<RegisterResult | RegisterFailure> {
    const { tenant, username, password } = request;

    if (!tenant) {
        return failure('Tenant is required', 'AUTH_TENANT_MISSING');
    }
    if (!username) {
        return failure('Username is required', 'AUTH_USERNAME_MISSING');
    }
    if (!password) {
        return failure('Password is required', 'AUTH_PASSWORD_MISSING');
    }
    if (!isCanonicalName(tenant)) {
        return failure(canonicalNameMessage('Tenant'), 'AUTH_TENANT_INVALID');
    }
    if (!isCanonicalName(username)) {
        return failure(canonicalNameMessage('Username'), 'AUTH_USERNAME_INVALID');
    }

    const existingTenant = await Infrastructure.getTenant(tenant);
    if (existingTenant) {
        return failure(`Tenant '${tenant}' already exists`, 'DATABASE_TENANT_EXISTS');
    }

    try {
        const broker = auth0BrokerFromEnv();
        await broker.registerScopedIdentity(auth0ScopedIdentity(tenant, username), password);
    } catch (error) {
        if (error instanceof Auth0BrokerError) {
            return failure(error.message, error.code);
        }
        throw error;
    }

    let result;
    try {
        result = await Infrastructure.createTenant({
            name: tenant,
            owner_username: username,
        });
    } catch (error: any) {
        if (error.message?.includes('already exists')) {
            return failure(`Tenant '${tenant}' already exists`, 'DATABASE_TENANT_EXISTS');
        }
        return failure(error.message || 'Registration failed', 'REGISTRATION_FAILED');
    }

    const token = await JWTGenerator.fromUserAndTenant(result.user, {
        ...result.tenant,
        tenant_id: result.tenant.id,
    });

    return {
        success: true,
        tenant: result.tenant.name,
        tenantId: result.tenant.id,
        username: result.user.auth,
        token,
    };
}

async function createLoginResult(
    tenantRecord: TenantRecord,
    user: {
        id: string;
        auth: string;
        access: string;
        access_read?: string[];
        access_edit?: string[];
        access_full?: string[];
    }
): Promise<LoginResult> {
    const payload: JWTPayload = {
        sub: user.id,
        user_id: user.id,
        username: user.auth,
        tenant: tenantRecord.name,
        tenant_id: tenantRecord.id,
        db_type: tenantRecord.db_type || 'postgresql',
        db: tenantRecord.database,
        ns: tenantRecord.schema,
        access: user.access,
        access_read: user.access_read || [],
        access_edit: user.access_edit || [],
        access_full: user.access_full || [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        is_sudo: user.access === 'root',
    };

    const token = await JWTGenerator.fromUserAndTenant(user, {
        name: tenantRecord.name,
        tenant_id: tenantRecord.id,
        db_type: tenantRecord.db_type || 'postgresql',
        database: tenantRecord.database,
        schema: tenantRecord.schema,
    });

    return {
        success: true,
        user: {
            id: user.id,
            username: user.auth,
            tenant: tenantRecord.name,
            tenantId: tenantRecord.id,
            access: user.access,
            accessRead: user.access_read || [],
            accessEdit: user.access_edit || [],
            accessFull: user.access_full || [],
        },
        token,
        payload,
        systemInit: systemInitFromJWT(payload),
    };
}

async function getTenantUserByAuth(
    tenantRecord: TenantRecord,
    username: string
): Promise<{
    id: string;
    auth: string;
    access: string;
    access_read?: string[];
    access_edit?: string[];
    access_full?: string[];
} | null> {
    const query = 'SELECT id, auth, access, access_read, access_edit, access_full FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL';

    if (tenantRecord.db_type === 'sqlite') {
        const adapter = createAdapterFrom('sqlite', tenantRecord.database, tenantRecord.schema);
        await adapter.connect();
        try {
            const result = await adapter.query<any>(query, [username]);
            const row = result.rows[0];
            if (!row) {
                return null;
            }
            return normalizeUserRow(row);
        } finally {
            await adapter.disconnect();
        }
    }

    const result = await DatabaseConnection.queryInNamespace(
        tenantRecord.database,
        tenantRecord.schema,
        query,
        [username]
    );
    const row = result.rows[0];
    return row ? normalizeUserRow(row) : null;
}

function normalizeUserRow(row: any) {
    return {
        ...row,
        access_read: parseAccessArray(row.access_read),
        access_edit: parseAccessArray(row.access_edit),
        access_full: parseAccessArray(row.access_full),
    };
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

function failure(error: string, errorCode: string): LoginFailure {
    return { success: false, error, errorCode };
}

function isCanonicalName(value: string): boolean {
    return CANONICAL_NAME_PATTERN.test(value);
}

function canonicalNameMessage(label: string): string {
    return `${label} must be snake_case, start with a letter, and contain only lowercase letters, numbers, and underscores`;
}
