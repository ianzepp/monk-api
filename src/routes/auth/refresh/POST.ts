import type { Context } from 'hono';
import { verify, sign } from 'hono/jwt';
import { JWT_DEFAULT_EXPIRY } from '@src/lib/constants.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { Infrastructure } from '@src/lib/infrastructure.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { createAdapterFrom } from '@src/lib/database/index.js';
import type { JWTPayload } from '@src/lib/jwt-generator.js';

/**
 * POST /auth/refresh - Refresh Monk bearer token
 *
 * Clients present the current Monk bearer token in the Authorization header.
 * Monk verifies the token, checks that the tenant and user are still active,
 * and returns a fresh Monk bearer token.
 */
export default async function (context: Context) {
    const authHeader = context.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw HttpErrors.unauthorized('Authorization bearer token required', 'AUTH_TOKEN_REQUIRED');
    }

    const token = authHeader.substring(7);

    let payload: JWTPayload;
    try {
        payload = (await verify(token, process.env.JWT_SECRET!, 'HS256')) as JWTPayload;
    } catch (error: any) {
        const errorMessage = String(error?.message ?? '').toLowerCase();
        if (error?.name === 'JwtTokenExpired' || errorMessage.includes('expired')) {
            return context.json({ success: false, error: 'Token has expired', error_code: 'AUTH_TOKEN_EXPIRED' }, 401);
        }
        return context.json({ success: false, error: 'Invalid token', error_code: 'AUTH_TOKEN_INVALID' }, 401);
    }

    if (payload.is_fake) {
        return context.json(
            {
                success: false,
                error: 'Impersonation tokens cannot be refreshed - request a new fake token instead',
                error_code: 'AUTH_FAKE_TOKEN_REFRESH_DENIED',
            },
            403
        );
    }

    const tenant = payload.tenant_id
        ? await Infrastructure.getTenantById(payload.tenant_id)
        : await Infrastructure.getTenant(payload.tenant);
    if (!tenant) {
        return context.json({ success: false, error: 'Invalid or expired token', error_code: 'AUTH_TOKEN_REFRESH_FAILED' }, 401);
    }

    const userResult = tenant.db_type === 'sqlite'
        ? await querySqliteUser(tenant.database, tenant.schema, payload.sub)
        : await DatabaseConnection.queryInNamespace(
            tenant.database,
            tenant.schema,
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [payload.sub]
        );

    if (!userResult.rows || userResult.rows.length === 0) {
        return context.json({ success: false, error: 'Invalid or expired token', error_code: 'AUTH_TOKEN_REFRESH_FAILED' }, 401);
    }

    const user = userResult.rows[0];
    const newPayload: JWTPayload = {
        sub: user.id,
        user_id: user.id,
        username: user.auth,
        tenant: tenant.name,
        tenant_id: tenant.id,
        db_type: tenant.db_type || 'postgresql',
        db: tenant.database,
        ns: tenant.schema,
        access: user.access,
        access_read: parseAccessArray(user.access_read),
        access_edit: parseAccessArray(user.access_edit),
        access_full: parseAccessArray(user.access_full),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + JWT_DEFAULT_EXPIRY,
        is_sudo: user.access === 'root',
        ...(payload.format && { format: payload.format }),
        ...(payload.auth_type && { auth_type: payload.auth_type }),
        ...(payload.key_id && { key_id: payload.key_id }),
        ...(payload.key_fingerprint && { key_fingerprint: payload.key_fingerprint }),
    };

    const newToken = await sign(newPayload, process.env.JWT_SECRET!);

    return context.json({
        success: true,
        data: {
            token: newToken,
            expires_in: JWT_DEFAULT_EXPIRY,
            user: {
                id: user.id,
                username: user.auth,
                tenant: tenant.name,
                tenant_id: tenant.id,
                access: user.access,
                ...(newPayload.format && { format: newPayload.format }),
            },
        },
    });
}

async function querySqliteUser(database: string, schema: string, userId: string) {
    const adapter = createAdapterFrom('sqlite', database, schema);
    await adapter.connect();
    try {
        return await adapter.query(
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE id = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [userId]
        );
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
