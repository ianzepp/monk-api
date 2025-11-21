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
 * Database names are always generated using SHA256 hashing to ensure:
 * - Environment isolation (same tenant in dev/test/prod gets same hash)
 * - No naming conflicts between environments
 * - Privacy (tenant name not exposed in database name)
 *
 * Request body:
 * - tenant (required): User-facing tenant name
 * - template (optional): Template name to use (defaults to 'system')
 * - username (optional): Username for the tenant admin (defaults to 'root')
 * - description (optional): Human-readable description of the tenant
 *
 * Error codes:
 * - AUTH_TENANT_MISSING: Missing tenant field (400)
 * - DATABASE_TEMPLATE_NOT_FOUND: Template does not exist (404)
 * - DATABASE_TENANT_EXISTS: Tenant name already registered (409)
 * - DATABASE_EXISTS: Database name already exists (409)
 * - DATABASE_TEMPLATE_CLONE_FAILED: Template cloning operation failed (500)
 *
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const { tenant, template, username, description } = await context.req.json();

    // Input validation
    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'AUTH_TENANT_MISSING');
    }

    // Clone specified template (defaults to 'system') with user-provided tenant name
    const templateName = template || 'system';

    const cloneResult = await DatabaseTemplate.cloneTemplate({
        template_name: templateName,
        tenant_name: tenant,
        username: username || 'root',
        user_access: 'root',
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
