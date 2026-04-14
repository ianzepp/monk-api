/**
 * Auth Validator Middleware
 *
 * Clean-break protected auth path:
 * - Accepts only Monk bearer tokens
 * - Rejects Auth0 bearer-token routing on protected endpoints
 * - Rejects API-key authentication
 * - Verifies the Monk token and ensures the tenant and user are still active
 */

import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { systemInitFromJWT } from '@src/lib/system.js';
import type { JWTPayload } from '@src/lib/jwt-generator.js';
import { Infrastructure } from '@src/lib/infrastructure.js';
import { createAdapterFrom, type DatabaseType } from '@src/lib/database/index.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { assertPublicKeyTokenUsable } from '@src/lib/public-key-auth.js';

function getJwtSecret(): string {
    return process.env['JWT_SECRET']!;
}

interface AuthenticatedUser {
    id: string;
    name: string;
    auth?: string;
    access: string;
    access_read: string[];
    access_edit: string[];
    access_full: string[];
}

async function validateUser(
    userId: string,
    dbType: DatabaseType,
    dbName: string,
    nsName: string
): Promise<AuthenticatedUser> {
    const adapter = createAdapterFrom(dbType, dbName, nsName);
    await adapter.connect();

    try {
        const userResult = await adapter.query<any>(
            'SELECT id, name, auth, access, access_read, access_edit, access_full FROM users WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [userId]
        );

        if (userResult.rows.length === 0) {
            throw HttpErrors.unauthorized('User not found or inactive', 'USER_NOT_FOUND');
        }

        const user = userResult.rows[0];
        return {
            id: user.id,
            name: user.name,
            auth: user.auth,
            access: user.access,
            access_read: parseAccessArray(user.access_read),
            access_edit: parseAccessArray(user.access_edit),
            access_full: parseAccessArray(user.access_full),
        };
    } finally {
        await adapter.disconnect();
    }
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

function canUseSudoToken(access: string): boolean {
    return access === 'root' || access === 'full';
}

async function resolveActiveTenantFromPayload(payload: JWTPayload) {
    const tenant = payload.tenant_id
        ? await Infrastructure.getTenantById(payload.tenant_id)
        : await Infrastructure.getTenant(payload.tenant);

    if (!tenant) {
        throw HttpErrors.unauthorized('Invalid tenant', 'AUTH_INVALID_TENANT');
    }

    return tenant;
}

export async function authValidatorMiddleware(context: Context, next: Next) {
    try {
        const authHeader = context.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw HttpErrors.unauthorized('Authorization token required', 'AUTH_TOKEN_REQUIRED');
        }

        const token = authHeader.substring(7);
        const payload = await verify(token, getJwtSecret(), 'HS256') as JWTPayload;
        const userId = payload.user_id;
        if (!userId || (!payload.tenant_id && !payload.tenant)) {
            throw HttpErrors.unauthorized('Invalid JWT - missing required claims', 'AUTH_TOKEN_INVALID');
        }

        // Dissolve confirmation tokens must never be accepted as API bearer tokens
        if (payload.token_use === 'dissolve') {
            throw HttpErrors.unauthorized('Dissolve confirmation tokens cannot be used as API bearer tokens', 'AUTH_TOKEN_INVALID');
        }

        const tenant = await resolveActiveTenantFromPayload(payload);
        if (payload.auth_type === 'public_key') {
            if (!payload.key_id) {
                throw HttpErrors.unauthorized('Invalid JWT - missing public-key claims', 'AUTH_TOKEN_INVALID');
            }
            await assertPublicKeyTokenUsable(tenant, payload.key_id);
        }
        const user = await validateUser(userId, tenant.db_type, tenant.database, tenant.schema);

        const trustedPayload: JWTPayload = {
            ...payload,
            username: user.auth || payload.username,
            tenant: tenant.name,
            tenant_id: tenant.id,
            db_type: tenant.db_type,
            db: tenant.database,
            ns: tenant.schema,
            access: user.access,
            access_read: user.access_read,
            access_edit: user.access_edit,
            access_full: user.access_full,
            is_sudo: payload.is_sudo === true && canUseSudoToken(user.access),
        };

        const correlationId = context.req.header('x-request-id');
        const systemInit = systemInitFromJWT(trustedPayload, correlationId || undefined);

        if (systemInit.dbType === 'postgresql') {
            DatabaseConnection.setDatabaseAndNamespaceForRequest(context, systemInit.dbName, systemInit.nsName);
        }

        context.set('jwtPayload', trustedPayload);
        context.set('systemInit', systemInit);
        context.set('user', {
            id: user.id,
            name: user.name,
            access: user.access,
            tenant: trustedPayload.tenant,
            dbName: systemInit.dbName,
            nsName: systemInit.nsName,
            access_read: user.access_read,
            access_edit: user.access_edit,
            access_full: user.access_full,
        });

        context.set('tenant', trustedPayload.tenant);
        context.set('dbType', systemInit.dbType);
        context.set('dbName', systemInit.dbName);
        context.set('nsName', systemInit.nsName);
        context.set('userId', user.id);
        context.set('accessReadIds', user.access_read);
        context.set('accessEditIds', user.access_edit);
        context.set('accessFullIds', user.access_full);

        return await next();
    } catch (error: any) {
        if (error.name === 'JwtTokenExpired') {
            throw HttpErrors.unauthorized('Token has expired', 'AUTH_TOKEN_EXPIRED');
        }

        if (error.name === 'JwtTokenInvalid' || error.message?.includes('jwt') || error.message === 'Unauthorized') {
            throw HttpErrors.unauthorized('Invalid token', 'AUTH_TOKEN_INVALID');
        }

        throw error;
    }
}
