import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';

/**
 * GET /auth/tenants - List available tenants (personal mode only)
 *
 * Returns a list of all tenant names and descriptions from the main database.
 * This endpoint is only available when the server is running in personal mode
 * (TENANT_NAMING_MODE=personal). It's useful for discovery in personal PaaS
 * deployments where users may manage multiple tenants.
 *
 * In enterprise mode, this endpoint returns a 403 error for security reasons
 * (tenant discovery should not be exposed in multi-tenant SaaS environments).
 *
 * @returns Array of tenant objects with name and description
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    // Check server mode - only allow in personal mode
    const serverMode = (process.env.TENANT_NAMING_MODE || 'enterprise') as 'enterprise' | 'personal';

    if (serverMode !== 'personal') {
        throw HttpErrors.forbidden(
            'Tenant listing is only available in personal mode',
            'TENANT_LIST_NOT_AVAILABLE'
        );
    }

    // Get main database connection
    const mainPool = DatabaseConnection.getMainPool();

    // Query all active tenants (excluding templates and trashed)
    const result = await mainPool.query(
        `
        SELECT name, description
        FROM tenants
        WHERE tenant_type = 'normal'
          AND is_active = true
          AND trashed_at IS NULL
          AND deleted_at IS NULL
        ORDER BY name ASC
        `
    );

    // Map to clean response format
    const tenants = result.rows.map((row) => ({
        name: row.name,
        description: row.description || null,
    }));

    return context.json({
        success: true,
        data: tenants,
    });
}
