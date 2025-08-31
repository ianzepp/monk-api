import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import type { JWTPayload } from '@src/lib/middleware/jwt-validation.js';

/**
 * POST /auth/login - Authenticate user with tenant and username
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const { tenant, username } = await context.req.json();

    logger.info('/auth/login', { tenant, username });

    // Input validation
    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'TENANT_MISSING');
    }

    if (!username) {
        throw HttpErrors.badRequest('Username is required', 'USERNAME_MISSING');
    }

    // Look up tenant record to get database name
    const authDb = DatabaseConnection.getMainPool();
    const tenantResult = await authDb.query('SELECT name, database FROM tenants WHERE name = $1 AND is_active = true AND trashed_at IS NULL AND deleted_at IS NULL', [tenant]);

    if (!tenantResult.rows || tenantResult.rows.length === 0) {
        return context.json(
            {
                success: false,
                error: 'Authentication failed',
                error_code: 'AUTH_FAILED',
            },
            401
        );
    } else {
        logger.info('Found tenant record:', { tenant: tenantResult.rows[0] });
    }

    const { name, database } = tenantResult.rows[0];

    // Look up user in the tenant's database
    const tenantDb = DatabaseConnection.getTenantPool(database);
    const userResult = await tenantDb.query('SELECT id, name, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL', [
        username,
    ]);

    if (!userResult.rows || userResult.rows.length === 0) {
        return context.json(
            {
                success: false,
                error: 'Authentication failed',
                error_code: 'AUTH_FAILED',
            },
            401
        );
    } else {
        logger.info('Found user record:', { user: userResult.rows[0] });
    }

    const user = userResult.rows[0];

    // Generate JWT token directly
    const payload: JWTPayload = {
        sub: user.id,
        user_id: user.id,
        tenant: name,
        database: database,
        access: user.access,
        access_read: user.access_read || [],
        access_edit: user.access_edit || [],
        access_full: user.access_full || [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };

    const token = await sign(payload, process.env.JWT_SECRET!);

    // Return response directly (no system context middleware)
    return context.json({
        success: true,
        data: {
            token,
            user: {
                id: user.id,
                username: user.name,
                tenant: name,
                database: database,
                access: user.access,
            },
        },
    });
}
