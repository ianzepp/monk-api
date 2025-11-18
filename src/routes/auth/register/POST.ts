import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseTemplate } from '@src/lib/database-template.js';
import type { JWTPayload } from '@src/lib/middleware/jwt-validation.js';

/**
 * POST /auth/register - User registration
 *
 * Creates a new tenant from a specified template with a user-specified tenant name.
 * Returns a JWT token for immediate access to the new tenant.
 *
 * The server's TENANT_NAMING_MODE environment variable controls the database naming strategy:
 * - enterprise mode: Database names are SHA256 hashes, username required
 * - personal mode: Database names are human-readable, username defaults to 'root'
 *
 * Request body:
 * - tenant (required): User-facing tenant name
 * - template (optional): Template name to use (defaults to 'empty'). Available templates can be listed via GET /auth/templates
 * - username (optional): Username for the tenant admin. Defaults to 'root' in personal mode, required in enterprise mode
 * - database (optional): Custom database name (personal mode only). Defaults to sanitized tenant name
 * - description (optional): Human-readable description of the tenant
 *
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const { tenant, template, username, database, description } = await context.req.json();

    // Input validation
    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'TENANT_MISSING');
    }

    // Determine mode from server configuration (not client-controlled)
    const serverMode = (process.env.TENANT_NAMING_MODE || 'enterprise') as 'enterprise' | 'personal';
    
    // Username is required in enterprise mode, optional in personal mode (defaults to 'root')
    if (!username && serverMode !== 'personal') {
        throw HttpErrors.badRequest('Username is required', 'USERNAME_MISSING');
    }

    // Validate database only allowed in personal mode
    if (database && serverMode !== 'personal') {
        throw HttpErrors.badRequest(
            'database parameter can only be specified when server is in personal mode',
            'DATABASE_NOT_ALLOWED'
        );
    }

    // Clone specified template (defaults to 'empty') with user-provided tenant name
    const templateName = template || 'empty';

    const cloneResult = await DatabaseTemplate.cloneTemplate({
        template_name: templateName,
        tenant_name: tenant,
        username: username,
        user_access: 'root',
        naming_mode: serverMode,
        database: database,
        description: description,
    });

    // Generate JWT token for the new user
    const payload: JWTPayload = {
        sub: cloneResult.user.id,
        user_id: cloneResult.user.id,
        tenant: cloneResult.tenant,
        database: cloneResult.database,
        access: cloneResult.user.access,
        access_read: cloneResult.user.access_read,
        access_edit: cloneResult.user.access_edit,
        access_full: cloneResult.user.access_full,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };

    const token = await sign(payload, process.env.JWT_SECRET!);

    return context.json({
        success: true,
        data: {
            tenant: cloneResult.tenant,
            database: cloneResult.database,
            username: cloneResult.user.auth,
            token: token,
            expires_in: 24 * 60 * 60,
        },
    });
}
