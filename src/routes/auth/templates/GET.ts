import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

/**
 * GET /auth/templates - List available templates (personal mode only)
 *
 * Returns a list of all available fixture names and descriptions that can be
 * used when registering a new tenant. This endpoint is only available when the
 * server is running in personal mode (TENANT_NAMING_MODE=personal).
 *
 * Templates are now fixtures - pre-built database models stored as SQL files
 * in the fixtures/ directory. Common fixtures include 'system' (minimal setup),
 * 'demo' (sample CRM data), and 'testing' (test data for development).
 *
 * In enterprise mode, this endpoint returns a 403 error for security reasons
 * (fixture discovery should not be exposed in multi-tenant SaaS environments).
 *
 * Error codes:
 * - AUTH_TEMPLATE_LIST_NOT_AVAILABLE: Endpoint called on enterprise mode server (403)
 *
 * @returns Array of fixture objects with name and description
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

    // Read fixtures from filesystem
    const fixturesDir = join(process.cwd(), 'fixtures');
    const entries = await readdir(fixturesDir, { withFileTypes: true });

    const templates = [];

    for (const entry of entries) {
        // Skip non-directories
        if (!entry.isDirectory()) continue;

        // Skip infrastructure directory (not a user-facing fixture)
        if (entry.name === 'infrastructure') continue;

        try {
            // Read template.json metadata
            const metadataPath = join(fixturesDir, entry.name, 'template.json');
            const content = await readFile(metadataPath, 'utf-8');
            const metadata = JSON.parse(content);

            templates.push({
                name: metadata.name || entry.name,
                description: metadata.description || null,
                is_system: metadata.is_system || false,
            });
        } catch (error) {
            // Skip fixtures without valid template.json
            console.warn(`Skipping fixture ${entry.name}: no valid template.json`);
            continue;
        }
    }

    // Sort: system fixtures first, then alphabetically by name
    templates.sort((a, b) => {
        if (a.is_system && !b.is_system) return -1;
        if (!a.is_system && b.is_system) return 1;
        return a.name.localeCompare(b.name);
    });

    // Remove is_system from response (internal field)
    const response = templates.map(({ name, description }) => ({
        name,
        description,
    }));

    return context.json({
        success: true,
        data: response,
    });
}
