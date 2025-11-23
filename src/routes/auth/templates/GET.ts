import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';

/**
 * GET /auth/templates - List available templates (personal mode only)
 *
 * Returns a list of all available template names and descriptions that can be
 * used when registering a new tenant. This endpoint is only available when the
 * server is running in personal mode (TENANT_NAMING_MODE=personal).
 *
 * Templates are pre-built database models that can be cloned for fast tenant
 * creation. Common templates include 'system' (minimal setup) and 'testing'
 * (includes sample data for development).
 *
 * In enterprise mode, this endpoint returns a 403 error for security reasons
 * (template discovery should not be exposed in multi-tenant SaaS environments).
 *
 * Error codes:
 * - AUTH_TEMPLATE_LIST_NOT_AVAILABLE: Endpoint called on enterprise mode server (403)
 *
 * @returns Array of template objects with name and description
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    // Check server mode - only allow in personal mode
    const serverMode = (process.env.TENANT_NAMING_MODE || 'enterprise') as 'enterprise' | 'personal';

    if (serverMode !== 'personal') {
        throw HttpErrors.forbidden(
            'Template listing is only available in personal mode',
            'AUTH_TEMPLATE_LIST_NOT_AVAILABLE'
        );
    }

    // Get main database connection
    const mainPool = DatabaseConnection.getMainPool();

    // Query all templates from new templates table
    const result = await mainPool.query(
        `
        SELECT name, description
        FROM templates
        ORDER BY is_system DESC, name ASC
        `
    );

    const templates = result.rows.map((row) => ({
        name: row.name,
        description: row.description || null,
    }));

    return context.json({
        success: true,
        data: templates,
    });
}
