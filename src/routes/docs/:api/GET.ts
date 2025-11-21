import type { Context } from 'hono';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /docs/:api - Get public API documentation as markdown
 * @see Self-documenting API pattern for CLI and AI integration
 */
export default async function (context: Context) {
    const api = context.req.param('api');

    // Validate api parameter
    if (!api || typeof api !== 'string') {
        throw HttpErrors.badRequest('API parameter is required', 'API_MISSING');
    }

    if (!/^[a-zA-Z-]+$/.test(api)) {
        throw HttpErrors.badRequest('API parameter must contain only letters and hyphens', 'API_INVALID_FORMAT');
    }

    // Determine documentation path based on API name and environment
    const apiLowercase = api.toLowerCase();
    const isDevelopment = process.env.NODE_ENV === 'development';
    const baseDir = isDevelopment ? 'src' : 'dist';
    let publicDocsPath: string;

    // Standard protected API documentation
    publicDocsPath = join(process.cwd(), baseDir, 'routes/api', apiLowercase, 'PUBLIC.md');

    // Check if documentation exists
    if (!existsSync(publicDocsPath)) {
        throw HttpErrors.notFound(`Documentation not found for '${api}' API`, 'DOCS_NOT_FOUND');
    }

    try {
        // Read markdown content
        const content = readFileSync(publicDocsPath, 'utf8');

        // Set proper content-type for markdown
        context.header('Content-Type', 'text/markdown; charset=utf-8');

        // Return markdown content directly (not JSON)
        return context.text(content);
    } catch (error) {
        throw HttpErrors.internal(`Failed to read documentation for '${api}' API`, 'DOCS_READ_ERROR');
    }
}
