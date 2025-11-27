import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { createAdapterFrom } from '@src/lib/database/index.js';
import type { JWTPayload } from '@src/lib/jwt-generator.js';
import { getClientIp, isIpAllowed } from '@src/lib/ip-utils.js';
import { Infrastructure } from '@src/lib/infrastructure.js';
import { verifyPassword } from '@src/lib/credentials/index.js';

/**
 * POST /auth/login - Authenticate user with tenant, username, and password
 *
 * Error codes:
 * - AUTH_TENANT_MISSING: Missing tenant field (400)
 * - AUTH_USERNAME_MISSING: Missing username field (400)
 * - AUTH_PASSWORD_REQUIRED: User has password but none provided (400)
 * - AUTH_LOGIN_FAILED: Invalid credentials or tenant not found (401)
 *
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const body = await context.req.json();

    // Body type validation
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an object', 'BODY_NOT_OBJECT');
    }

    const { tenant, username, password, format } = body;

    console.info('/auth/login', { tenant, username, format });

    // Input validation
    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'AUTH_TENANT_MISSING');
    }

    if (!username) {
        throw HttpErrors.badRequest('Username is required', 'AUTH_USERNAME_MISSING');
    }

    // Look up tenant record from infrastructure database
    const tenantRecord = await Infrastructure.getTenant(tenant);

    // Check tenant exists
    if (!tenantRecord) {
        return context.json(
            {
                success: false,
                error: 'Authentication failed',
                error_code: 'AUTH_LOGIN_FAILED',
            },
            401
        );
    }

    console.info('Found tenant record:', { tenant: tenantRecord });

    const { name, db_type: dbType, database: dbName, schema: nsName } = tenantRecord;

    // Look up user in the tenant's namespace
    // Use adapter for SQLite, DatabaseConnection for PostgreSQL
    let userResult: { rows: any[] };

    if (dbType === 'sqlite') {
        // SQLite: use adapter system
        const adapter = createAdapterFrom('sqlite', dbName, nsName);
        await adapter.connect();
        try {
            userResult = await adapter.query(
                'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
                [username]
            );
        } finally {
            await adapter.disconnect();
        }
    } else {
        // PostgreSQL: use existing connection pool
        userResult = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [username]
        );
    }

    if (!userResult.rows || userResult.rows.length === 0) {
        return context.json(
            {
                success: false,
                error: 'Authentication failed',
                error_code: 'AUTH_LOGIN_FAILED',
            },
            401
        );
    } else {
        console.info('Found user record:', { user: userResult.rows[0] });
    }

    const user = userResult.rows[0];

    // Check for password credential
    let credentialResult: { rows: any[] };

    if (dbType === 'sqlite') {
        const adapter = createAdapterFrom('sqlite', dbName, nsName);
        await adapter.connect();
        try {
            credentialResult = await adapter.query(
                `SELECT secret FROM credentials
                 WHERE user_id = $1 AND type = 'password' AND deleted_at IS NULL
                 ORDER BY created_at DESC LIMIT 1`,
                [user.id]
            );
        } finally {
            await adapter.disconnect();
        }
    } else {
        credentialResult = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            `SELECT secret FROM credentials
             WHERE user_id = $1 AND type = 'password' AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [user.id]
        );
    }

    // If user has a password credential, verify it
    if (credentialResult.rows && credentialResult.rows.length > 0) {
        const storedHash = credentialResult.rows[0].secret;

        // Password is required if user has one set
        if (!password) {
            throw HttpErrors.badRequest(
                'Password is required',
                'AUTH_PASSWORD_REQUIRED'
            );
        }

        // Verify password
        const isValid = await verifyPassword(password, storedHash);
        if (!isValid) {
            return context.json(
                {
                    success: false,
                    error: 'Authentication failed',
                    error_code: 'AUTH_LOGIN_FAILED',
                },
                401
            );
        }

        console.info('Password verified for user:', { userId: user.id });
    } else {
        // No password set - allow login (backwards compatible)
        // TODO: Consider making password required for new tenants
        console.info('No password credential found for user:', { userId: user.id });
    }

    // Generate JWT token directly
    const payload: JWTPayload = {
        sub: user.id,
        user_id: user.id,
        tenant: name,
        db_type: dbType || 'postgresql', // Database backend type (default for legacy tenants)
        db: dbName, // Compact JWT field
        ns: nsName, // Compact JWT field
        access: user.access,
        access_read: user.access_read || [],
        access_edit: user.access_edit || [],
        access_full: user.access_full || [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
        // Root users automatically have sudo access (like Linux root)
        // Full users must call POST /api/user/sudo to elevate
        is_sudo: user.access === 'root',
        // Include format preference if provided
        ...(format && ['json', 'toon', 'yaml'].includes(format) && { format }),
    };

    const token = await sign(payload, process.env.JWT_SECRET!);

    // Return response directly (no system context middleware)
    // Note: context.json() is transparently overridden by responseFormatterMiddleware
    // to support ?format=toon|yaml|etc - routes work with JSON, formatters handle encoding
    return context.json({
        success: true,
        data: {
            token,
            user: {
                id: user.id,
                username: user.auth,
                tenant: name,
                access: user.access,
                ...(format && ['json', 'toon', 'yaml'].includes(format) && { format }),
            },
        },
    });
}
