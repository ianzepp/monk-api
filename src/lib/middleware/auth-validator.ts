/**
 * Auth Validator Middleware
 *
 * Unified authentication middleware that:
 * 1. Validates JWT signature or API key
 * 2. Validates user exists and is active
 * 3. Creates SystemInit with fresh user permissions
 *
 * Supported authentication methods:
 * - Authorization: Bearer <jwt_token>
 * - Authorization: Bearer <api_key> (requires X-Tenant header)
 * - X-API-Key: <api_key> (requires X-Tenant header)
 */

import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { systemInitFromJWT } from '@src/lib/system.js';
import type { JWTPayload } from '@src/lib/jwt-generator.js';
import { isValidApiKeyFormat, verifyApiKey } from '@src/lib/credentials/index.js';
import { computeEffectiveApiKeyAccess, parseStoredApiKeyPermissions } from '@src/lib/credentials/permissions.js';
import { Infrastructure, type TenantRecord } from '@src/lib/infrastructure.js';
import { createAdapterFrom, type DatabaseType } from '@src/lib/database/index.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import {
    Auth0ConfigError,
    Auth0IdentityMappingError,
    Auth0VerificationError,
    Auth0Verifier,
    resolveAuth0Identity,
    type VerifiedAuth0Identity,
} from '@src/lib/auth0/index.js';
import { assertLocalAuthEnabled, isLocalAuthEnabled } from '@src/lib/auth/local-auth-policy.js';

function getJwtSecret(): string {
    return process.env['JWT_SECRET']!;
}

interface AuthResult {
    payload: JWTPayload;
    user: {
        id: string;
        name: string;
        auth?: string;
        access: string;
        access_read: string[];
        access_edit: string[];
        access_full: string[];
    };
}

type Auth0VerifierFactory = () => Pick<Auth0Verifier, 'verifyAccessToken'>;

let auth0VerifierFactory: Auth0VerifierFactory | null = null;

export function setAuth0VerifierFactoryForTests(factory: Auth0VerifierFactory | null): void {
    auth0VerifierFactory = factory;
}

/**
 * Authenticate using an API key
 * Returns JWT payload and validated user data
 */
async function authenticateApiKey(apiKey: string, tenantName: string): Promise<AuthResult> {
    // Look up tenant
    const tenantRecord = await Infrastructure.getTenant(tenantName);
    if (!tenantRecord) {
        throw HttpErrors.unauthorized('Invalid tenant', 'AUTH_INVALID_TENANT');
    }

    const { name, db_type: dbType, database: dbName, schema: nsName } = tenantRecord;

    // Look up API key credential by prefix (first 16 chars)
    const prefix = apiKey.substring(0, 16);
    let credentialResult: { rows: any[] };

    if (dbType === 'sqlite') {
        const adapter = createAdapterFrom('sqlite', dbName, nsName);
        await adapter.connect();
        try {
            credentialResult = await adapter.query(
                `SELECT c.id, c.user_id, c.secret, c.permissions, c.expires_at,
                        u.name as user_name, u.auth as username, u.access, u.access_read, u.access_edit, u.access_full, u.access_deny
                 FROM credentials c
                 JOIN users u ON u.id = c.user_id
                 WHERE c.identifier = $1 AND c.type = 'api_key' AND c.deleted_at IS NULL
                   AND u.trashed_at IS NULL AND u.deleted_at IS NULL`,
                [prefix]
            );
        } finally {
            await adapter.disconnect();
        }
    } else {
        credentialResult = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            `SELECT c.id, c.user_id, c.secret, c.permissions, c.expires_at,
                    u.name as user_name, u.auth as username, u.access, u.access_read, u.access_edit, u.access_full, u.access_deny
             FROM credentials c
             JOIN users u ON u.id = c.user_id
             WHERE c.identifier = $1 AND c.type = 'api_key' AND c.deleted_at IS NULL
               AND u.trashed_at IS NULL AND u.deleted_at IS NULL`,
            [prefix]
        );
    }

    if (!credentialResult.rows || credentialResult.rows.length === 0) {
        throw HttpErrors.unauthorized('Invalid API key', 'AUTH_INVALID_API_KEY');
    }

    const credential = credentialResult.rows[0];

    // Verify the full API key hash
    if (!verifyApiKey(apiKey, credential.secret)) {
        throw HttpErrors.unauthorized('Invalid API key', 'AUTH_INVALID_API_KEY');
    }

    // Check expiration
    if (credential.expires_at && new Date(credential.expires_at) < new Date()) {
        throw HttpErrors.unauthorized('API key has expired', 'AUTH_API_KEY_EXPIRED');
    }

    // Update last_used_at (fire and forget - don't block response)
    const updateLastUsed = async () => {
        try {
            if (dbType === 'sqlite') {
                const adapter = createAdapterFrom('sqlite', dbName, nsName);
                await adapter.connect();
                try {
                    await adapter.query(
                        `UPDATE credentials SET last_used_at = $1 WHERE id = $2`,
                        [new Date().toISOString(), credential.id]
                    );
                } finally {
                    await adapter.disconnect();
                }
            } else {
                await DatabaseConnection.queryInNamespace(
                    dbName,
                    nsName,
                    `UPDATE credentials SET last_used_at = $1 WHERE id = $2`,
                    [new Date().toISOString(), credential.id]
                );
            }
        } catch (e) {
            // Ignore errors - this is non-critical
            console.error('Failed to update API key last_used_at:', e);
        }
    };
    updateLastUsed(); // Don't await

    // Parse JSON arrays for SQLite
    const accessRead = typeof credential.access_read === 'string'
        ? JSON.parse(credential.access_read) : (credential.access_read || []);
    const accessEdit = typeof credential.access_edit === 'string'
        ? JSON.parse(credential.access_edit) : (credential.access_edit || []);
    const accessFull = typeof credential.access_full === 'string'
        ? JSON.parse(credential.access_full) : (credential.access_full || []);

    const effectiveAccess = computeEffectiveApiKeyAccess(
        {
            access: credential.access,
            access_read: accessRead,
            access_edit: accessEdit,
            access_full: accessFull,
        },
        parseStoredApiKeyPermissions(credential.permissions)
    );

    // Build JWT payload for the API key
    const payload: JWTPayload = {
        sub: credential.user_id,
        user_id: credential.user_id,
        username: credential.username,
        tenant: name,
        db_type: dbType || 'postgresql',
        db: dbName,
        ns: nsName,
        access: effectiveAccess.access,
        access_read: effectiveAccess.access_read,
        access_edit: effectiveAccess.access_edit,
        access_full: effectiveAccess.access_full,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        is_sudo: effectiveAccess.is_sudo,
        is_api_key: true,
        api_key_id: credential.id,
    };

    return {
        payload,
        user: {
            id: credential.user_id,
            name: credential.user_name,
            access: effectiveAccess.access,
            access_read: effectiveAccess.access_read,
            access_edit: effectiveAccess.access_edit,
            access_full: effectiveAccess.access_full,
        },
    };
}

/**
 * Validate user exists in tenant database
 * Returns fresh user data from DB
 */
async function validateUser(
    userId: string,
    dbType: DatabaseType,
    dbName: string,
    nsName: string
): Promise<AuthResult['user']> {
    const adapter = createAdapterFrom(dbType, dbName, nsName);
    await adapter.connect();

    try {
        const userResult = await adapter.query<any>(
            'SELECT id, name, access, access_read, access_edit, access_full FROM users WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [userId]
        );

        if (userResult.rows.length === 0) {
            throw HttpErrors.unauthorized('User not found or inactive', 'USER_NOT_FOUND');
        }

        const user = userResult.rows[0];

        // Parse JSON arrays for SQLite
        const accessRead = typeof user.access_read === 'string'
            ? JSON.parse(user.access_read) : (user.access_read || []);
        const accessEdit = typeof user.access_edit === 'string'
            ? JSON.parse(user.access_edit) : (user.access_edit || []);
        const accessFull = typeof user.access_full === 'string'
            ? JSON.parse(user.access_full) : (user.access_full || []);

        return {
            id: user.id,
            name: user.name,
            access: user.access,
            access_read: accessRead,
            access_edit: accessEdit,
            access_full: accessFull,
        };
    } finally {
        await adapter.disconnect();
    }
}

async function authenticateAuth0Bearer(token: string): Promise<AuthResult> {
    const verifier = auth0VerifierFactory ? auth0VerifierFactory() : new Auth0Verifier();
    const identity = await verifier.verifyAccessToken(token);
    const resolved = await resolveAuth0Identity(identity.iss, identity.sub);
    const { tenant, user } = resolved;

    const payload = jwtPayloadFromAuth0Identity(identity, tenant, user);

    return {
        payload,
        user: {
            id: user.id,
            name: user.name,
            auth: user.auth,
            access: user.access,
            access_read: user.access_read,
            access_edit: user.access_edit,
            access_full: user.access_full,
        },
    };
}

function jwtPayloadFromAuth0Identity(
    identity: VerifiedAuth0Identity,
    tenant: TenantRecord,
    user: AuthResult['user']
): JWTPayload {
    return {
        sub: user.id,
        user_id: user.id,
        username: user.auth || user.name,
        tenant: tenant.name,
        tenant_id: tenant.id,
        db_type: tenant.db_type,
        db: tenant.database,
        ns: tenant.schema,
        access: user.access,
        access_read: user.access_read,
        access_edit: user.access_edit,
        access_full: user.access_full,
        iat: identity.iat || Math.floor(Date.now() / 1000),
        exp: identity.exp || Math.floor(Date.now() / 1000),
        is_sudo: false,
        auth0_issuer: identity.iss,
        auth0_subject: identity.sub,
    };
}

async function resolveActiveTenantFromPayload(payload: JWTPayload): Promise<TenantRecord> {
    const tenant = payload.tenant_id
        ? await Infrastructure.getTenantById(payload.tenant_id)
        : await Infrastructure.getTenant(payload.tenant);

    if (!tenant) {
        throw HttpErrors.unauthorized('Invalid tenant', 'AUTH_INVALID_TENANT');
    }

    return tenant;
}

function shouldUseAuth0ForBearer(): boolean {
    return process.env.NODE_ENV === 'production'
        || Boolean(process.env.AUTH0_ISSUER || process.env.AUTH0_DOMAIN || process.env.AUTH0_AUDIENCE || process.env.AUTH0_JWKS_URL);
}

/**
 * Auth validation middleware - validates token and user in one pass
 *
 * For JWT auth: validates signature, then queries user
 * For API key auth: validates key and user in single query (no redundant lookup)
 */
export async function authValidatorMiddleware(context: Context, next: Next) {
    try {
        // Check for API key header first
        const apiKeyHeader = context.req.header('X-API-Key');
        const authHeader = context.req.header('Authorization');
        const tenantHeader = context.req.header('X-Tenant') || context.req.header('X-Monk-Tenant');

        let token: string | null = null;
        let isApiKey = false;

        if (apiKeyHeader) {
            token = apiKeyHeader;
            isApiKey = isValidApiKeyFormat(token);
        } else if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.substring(7);
            isApiKey = isValidApiKeyFormat(token);
        }

        if (!token) {
            throw HttpErrors.unauthorized('Authorization token required', 'AUTH_TOKEN_REQUIRED');
        }

        let payload: JWTPayload;
        let user: AuthResult['user'];

        if (isApiKey) {
            // API key auth - validates key and user in one query
            if (!tenantHeader) {
                throw HttpErrors.badRequest(
                    'X-Tenant header required when using API key authentication',
                    'AUTH_TENANT_HEADER_REQUIRED'
                );
            }
            const result = await authenticateApiKey(token, tenantHeader);
            payload = result.payload;
            user = result.user;
        } else {
            if (shouldUseAuth0ForBearer()) {
                const result = await authenticateAuth0Bearer(token);
                payload = result.payload;
                user = result.user;
            } else {
                assertLocalAuthEnabled('Local bearer JWT authentication');

                // Explicit development/test bootstrap path. Production bearer auth is Auth0/OIDC.
                payload = await verify(token, getJwtSecret(), 'HS256') as JWTPayload;

                const userId = payload.user_id;
                if (!userId || (!payload.tenant_id && !payload.tenant)) {
                    throw HttpErrors.unauthorized('Invalid JWT - missing required claims', 'AUTH_TOKEN_INVALID');
                }

                const tenant = await resolveActiveTenantFromPayload(payload);
                user = await validateUser(userId, tenant.db_type, tenant.database, tenant.schema);

                // Do not trust DB/schema routing claims from the token. Resolve them from Monk state.
                payload = {
                    ...payload,
                    tenant: tenant.name,
                    tenant_id: tenant.id,
                    db_type: tenant.db_type,
                    db: tenant.database,
                    ns: tenant.schema,
                };
            }
        }

        // Rebuild effective privilege state from current Monk user data.
        // Token claims may be stale after role downgrades.
        payload = {
            ...payload,
            access: user.access,
            access_read: user.access_read,
            access_edit: user.access_edit,
            access_full: user.access_full,
            is_sudo: payload.is_sudo === true && (user.access === 'root' || user.access === 'full'),
        };

        // Create SystemInit with fresh user permissions
        const correlationId = context.req.header('x-request-id');
        const systemInit = systemInitFromJWT(payload, correlationId || undefined);

        // Set up PostgreSQL pool context when the request targets PostgreSQL.
        // SQLite tenants are opened through per-request adapters downstream.
        if (systemInit.dbType === 'postgresql') {
            DatabaseConnection.setDatabaseAndNamespaceForRequest(context, systemInit.dbName, systemInit.nsName);
        }

        // Store in context
        context.set('jwtPayload', payload);
        context.set('systemInit', systemInit);
        context.set('user', {
            id: user.id,
            name: user.name,
            access: user.access,
            tenant: payload.tenant,
            dbName: systemInit.dbName,
            nsName: systemInit.nsName,
            access_read: user.access_read,
            access_edit: user.access_edit,
            access_full: user.access_full,
        });

        // Legacy context values
        context.set('tenant', payload.tenant);
        context.set('dbType', systemInit.dbType);
        context.set('dbName', systemInit.dbName);
        context.set('nsName', systemInit.nsName);
        context.set('userId', user.id);
        context.set('accessReadIds', user.access_read);
        context.set('accessEditIds', user.access_edit);
        context.set('accessFullIds', user.access_full);

        return await next();

    } catch (error: any) {
        // Token expired
        if (error.name === 'JwtTokenExpired') {
            throw HttpErrors.unauthorized('Token has expired', 'AUTH_TOKEN_EXPIRED');
        }

        // Token invalid
        if (error.name === 'JwtTokenInvalid' || error.message?.includes('jwt') || error.message === 'Unauthorized') {
            throw HttpErrors.unauthorized('Invalid token', 'AUTH_TOKEN_INVALID');
        }

        if (error instanceof Auth0ConfigError) {
            throw HttpErrors.unauthorized(error.message, error.code);
        }

        if (error instanceof Auth0VerificationError) {
            throw HttpErrors.unauthorized(error.message, error.code);
        }

        if (error instanceof Auth0IdentityMappingError) {
            throw HttpErrors.unauthorized(error.message, error.code);
        }

        if (error.errorCode === 'LOCAL_AUTH_DISABLED') {
            throw error;
        }

        throw error;
    }
}
