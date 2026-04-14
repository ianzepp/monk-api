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
import { JWT_DEFAULT_EXPIRY, JWT_DISSOLVE_EXPIRY } from '@src/lib/constants.js';
import { systemInitFromJWT, type SystemInit } from '@src/lib/system.js';
import { Auth0BrokerError, auth0BrokerFromEnv, auth0ScopedIdentity } from '@src/lib/auth0/index.js';

const CANONICAL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const SCOPED_IDENTITY_SEPARATOR = ':';

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
    if (tenant) {
        const tenantSeparatorError = disallowScopedIdentitySeparator('Tenant', tenant);
        if (tenantSeparatorError) {
            return failure(tenantSeparatorError, 'AUTH_TENANT_INVALID');
        }
        if (!isCanonicalName(tenant)) {
            return failure(canonicalNameMessage('Tenant'), 'AUTH_TENANT_INVALID');
        }
    }
    const usernameSeparatorError = disallowScopedIdentitySeparator('Username', username);
    if (usernameSeparatorError) {
        return failure(usernameSeparatorError, 'AUTH_USERNAME_INVALID');
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
    email?: string;
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
    const { tenant, username, email, password } = request;

    if (!tenant) {
        return failure('Tenant is required', 'AUTH_TENANT_MISSING');
    }
    if (!username) {
        return failure('Username is required', 'AUTH_USERNAME_MISSING');
    }
    if (!email) {
        return failure('Email is required', 'AUTH_EMAIL_MISSING');
    }
    if (!password) {
        return failure('Password is required', 'AUTH_PASSWORD_MISSING');
    }
    const tenantSeparatorError = disallowScopedIdentitySeparator('Tenant', tenant);
    if (tenantSeparatorError) {
        return failure(tenantSeparatorError, 'AUTH_TENANT_INVALID');
    }
    if (!isCanonicalName(tenant)) {
        return failure(canonicalNameMessage('Tenant'), 'AUTH_TENANT_INVALID');
    }
    const usernameSeparatorError = disallowScopedIdentitySeparator('Username', username);
    if (usernameSeparatorError) {
        return failure(usernameSeparatorError, 'AUTH_USERNAME_INVALID');
    }
    if (!isCanonicalName(username)) {
        return failure(canonicalNameMessage('Username'), 'AUTH_USERNAME_INVALID');
    }
    if (!isValidEmail(email)) {
        return failure('Email must be a valid email address', 'AUTH_EMAIL_INVALID');
    }

    const existingTenant = await Infrastructure.getTenant(tenant);
    if (existingTenant) {
        return failure(`Tenant '${tenant}' already exists`, 'DATABASE_TENANT_EXISTS');
    }

    try {
        const broker = auth0BrokerFromEnv();
        await broker.registerScopedIdentity(auth0ScopedIdentity(tenant, username), email, password);
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
        exp: Math.floor(Date.now() / 1000) + JWT_DEFAULT_EXPIRY,
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

export function authTokenExpiresInSeconds(): number {
    return JWT_DEFAULT_EXPIRY;
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

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function canonicalNameMessage(label: string): string {
    return `${label} must be snake_case, start with a letter, and contain only lowercase letters, numbers, and underscores`;
}

function disallowScopedIdentitySeparator(label: string, value: string): string | null {
    if (value.includes(SCOPED_IDENTITY_SEPARATOR)) {
        return `${label} must not contain '${SCOPED_IDENTITY_SEPARATOR}'`;
    }
    return null;
}

/**
 * Dissolve request parameters
 */
export interface DissolveRequest {
    tenant: string;
    username: string;
    password: string;
}

/**
 * Dissolve result on success — returns a short-lived confirmation token
 */
export interface DissolveResult {
    success: true;
    confirmation_token: string;
    expires_in: number;
}

/**
 * Dissolve failure result
 */
export interface DissolveFailure {
    success: false;
    error: string;
    errorCode: string;
}

/**
 * Dissolve confirm request parameters
 */
export interface DissolveConfirmRequest {
    confirmation_token: string;
}

/**
 * Dissolve confirm result on success
 */
export interface DissolveConfirmResult {
    success: true;
    tenant: string;
    username: string;
    dissolved: boolean;
}

/**
 * Dissolve confirm failure result
 */
export interface DissolveConfirmFailure {
    success: false;
    error: string;
    errorCode: string;
}

/**
 * Step 1 of the dissolution flow.
 *
 * Verifies the supplied credentials exactly as login does, then returns a
 * short-lived dissolve-only confirmation token.  The token is signed with the
 * server secret and carries `is_dissolve: true` so normal auth middleware will
 * reject it if presented as a bearer token.
 */
export async function dissolve(
    request: DissolveRequest
): Promise<DissolveResult | DissolveFailure> {
    const { tenant, username, password } = request;

    if (!tenant) {
        return dissolveFailure('Tenant is required', 'AUTH_TENANT_MISSING');
    }
    if (!username) {
        return dissolveFailure('Username is required', 'AUTH_USERNAME_MISSING');
    }
    if (!password) {
        return dissolveFailure('Password is required', 'AUTH_PASSWORD_MISSING');
    }

    const tenantSeparatorError = disallowScopedIdentitySeparator('Tenant', tenant);
    if (tenantSeparatorError) {
        return dissolveFailure(tenantSeparatorError, 'AUTH_TENANT_INVALID');
    }
    if (!isCanonicalName(tenant)) {
        return dissolveFailure(canonicalNameMessage('Tenant'), 'AUTH_TENANT_INVALID');
    }

    const usernameSeparatorError = disallowScopedIdentitySeparator('Username', username);
    if (usernameSeparatorError) {
        return dissolveFailure(usernameSeparatorError, 'AUTH_USERNAME_INVALID');
    }
    if (!isCanonicalName(username)) {
        return dissolveFailure(canonicalNameMessage('Username'), 'AUTH_USERNAME_INVALID');
    }

    const tenantRecord = await Infrastructure.getTenant(tenant);
    if (!tenantRecord) {
        return dissolveFailure('Authentication failed', 'AUTH_LOGIN_FAILED');
    }

    const user = await getTenantUserByAuth(tenantRecord, username);
    if (!user) {
        return dissolveFailure('Authentication failed', 'AUTH_LOGIN_FAILED');
    }

    try {
        const broker = auth0BrokerFromEnv();
        await broker.authenticateScopedIdentity(auth0ScopedIdentity(tenantRecord.name, username), password);
    } catch (error) {
        if (error instanceof Auth0BrokerError) {
            return dissolveFailure(error.message, error.code);
        }
        throw error;
    }

    const token = await JWTGenerator.generateDissolveToken(
        {
            id: user.id,
            user_id: user.id,
            username: user.auth,
            tenant: tenantRecord.name,
            tenantId: tenantRecord.id,
            dbType: tenantRecord.db_type || 'postgresql',
            dbName: tenantRecord.database,
            nsName: tenantRecord.schema,
            access: user.access,
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
        },
        {
            name: tenantRecord.name,
            tenantId: tenantRecord.id,
            dbType: tenantRecord.db_type || 'postgresql',
            dbName: tenantRecord.database,
            nsName: tenantRecord.schema,
        },
        'Tenant/user dissolution confirmation'
    );

    return {
        success: true,
        confirmation_token: token,
        expires_in: JWT_DISSOLVE_EXPIRY,
    };
}

/**
 * Step 2 of the dissolution flow.
 *
 * Validates the confirmation token, then permanently soft-deletes the tenant
 * so subsequent logins for the same credentials fail.  The user record inside
 * the tenant namespace is also soft-deleted.  We reuse the existing
 * `Infrastructure.deleteTenant` soft-delete pattern — no new tables required.
 */
export async function dissolveConfirm(
    request: DissolveConfirmRequest
): Promise<DissolveConfirmResult | DissolveConfirmFailure> {
    const { confirmation_token } = request;

    if (!confirmation_token) {
        return dissolveFailure('Confirmation token is required', 'DISSOLVE_TOKEN_MISSING');
    }

    let payload: JWTPayload;
    try {
        payload = await JWTGenerator.verifyToken(confirmation_token);
    } catch (error: any) {
        if (error?.name === 'JwtTokenExpired') {
            return dissolveFailure('Confirmation token has expired', 'DISSOLVE_TOKEN_EXPIRED');
        }
        return dissolveFailure('Invalid confirmation token', 'DISSOLVE_TOKEN_INVALID');
    }

    // Must be a dissolve token, not a normal access token
    if (!payload.is_dissolve) {
        return dissolveFailure('Token is not a dissolve confirmation token', 'DISSOLVE_TOKEN_INVALID');
    }

    const tenantName = payload.tenant;
    const username = payload.username;
    const userId = payload.user_id || payload.sub;

    if (!tenantName || !username || !userId) {
        return dissolveFailure('Confirmation token is missing required claims', 'DISSOLVE_TOKEN_INVALID');
    }

    // Re-resolve tenant to confirm it still exists and is active
    const tenantRecord = payload.tenant_id
        ? await Infrastructure.getTenantById(payload.tenant_id)
        : await Infrastructure.getTenant(tenantName);

    if (!tenantRecord) {
        return dissolveFailure('Tenant not found or already dissolved', 'DISSOLVE_TENANT_NOT_FOUND');
    }

    // Soft-delete the user inside the tenant namespace first
    try {
        const timestamp = new Date().toISOString();
        if (tenantRecord.db_type === 'sqlite') {
            const adapter = createAdapterFrom('sqlite', tenantRecord.database, tenantRecord.schema);
            await adapter.connect();
            try {
                await adapter.query(
                    `UPDATE users SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
                    [timestamp, timestamp, userId]
                );
            } finally {
                await adapter.disconnect();
            }
        } else {
            await DatabaseConnection.queryInNamespace(
                tenantRecord.database,
                tenantRecord.schema,
                `UPDATE users SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
                [timestamp, timestamp, userId]
            );
        }
    } catch {
        // Non-fatal: user delete failure should not block tenant dissolution
    }

    // Soft-delete the tenant (sets deleted_at + is_active = false)
    await Infrastructure.deleteTenant(tenantName);

    return {
        success: true,
        tenant: tenantName,
        username,
        dissolved: true,
    };
}

function dissolveFailure(error: string, errorCode: string): DissolveFailure {
    return { success: false, error, errorCode };
}
