import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import type { JWTPayload } from '@src/lib/jwt-generator.js';
import { getClientIp, isIpAllowed } from '@src/lib/ip-utils.js';

/**
 * POST /auth/login - Authenticate user with tenant and username
 *
 * Error codes:
 * - AUTH_TENANT_MISSING: Missing tenant field (400)
 * - AUTH_USERNAME_MISSING: Missing username field (400)
 * - AUTH_LOGIN_FAILED: Invalid credentials or tenant not found (401)
 *
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const { tenant, username, format } = await context.req.json();

    console.info('/auth/login', { tenant, username, format });

    // Input validation
    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'AUTH_TENANT_MISSING');
    }

    if (!username) {
        throw HttpErrors.badRequest('Username is required', 'AUTH_USERNAME_MISSING');
    }

    // Look up tenant record to get database type, database, schema, and IP restrictions
    const authDb = DatabaseConnection.getMainPool();
    const tenantResult = await authDb.query('SELECT name, db_type, database, schema, allowed_ips FROM tenants WHERE name = $1 AND is_active = true AND trashed_at IS NULL AND deleted_at IS NULL', [tenant]);

    // Check tenant exists
    if (!tenantResult.rows || tenantResult.rows.length === 0) {
        return context.json(
            {
                success: false,
                error: 'Authentication failed',
                error_code: 'AUTH_LOGIN_FAILED',
            },
            401
        );
    }

    const tenantRecord = tenantResult.rows[0];

    // Check IP restrictions - return same error as "not found" for security
    if (tenantRecord.allowed_ips && tenantRecord.allowed_ips.length > 0) {
        const clientIp = getClientIp(context);
        if (!isIpAllowed(clientIp, tenantRecord.allowed_ips)) {
            console.info('Login blocked by IP restriction', { tenant, clientIp, allowed: tenantRecord.allowed_ips });
            return context.json(
                {
                    success: false,
                    error: 'Authentication failed',
                    error_code: 'AUTH_LOGIN_FAILED',
                },
                401
            );
        }
    }

    console.info('Found tenant record:', { tenant: tenantRecord });

    const { name, db_type: dbType, database: dbName, schema: nsName } = tenantRecord;

    // Look up user in the tenant's namespace
    const userResult = await DatabaseConnection.queryInNamespace(
        dbName,
        nsName,
        'SELECT id, name, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
        [username]
    );

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
                username: user.name,
                tenant: name,
                access: user.access,
                ...(format && ['json', 'toon', 'yaml'].includes(format) && { format }),
            },
        },
    });
}
