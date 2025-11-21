import type { Context } from 'hono';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /docs/:api/* - Get endpoint-specific documentation
 *
 * Maps documentation URLs to markdown files with smart placeholder resolution:
 * - /docs/describe/schema/GET → describe/:schema/GET.md
 * - /docs/data/schema/record/GET → data/:schema/:record/GET.md
 *
 * @see Self-documenting API pattern for CLI and AI integration
 */
export default async function (context: Context) {
    const api = context.req.param('api');
    const wildcardPath = context.req.param('endpoint') || '';

    // Validate api parameter
    if (!api || typeof api !== 'string') {
        throw HttpErrors.badRequest('API parameter is required', 'API_MISSING');
    }

    if (!/^[a-zA-Z-]+$/.test(api)) {
        throw HttpErrors.badRequest('API parameter must contain only letters and hyphens', 'API_INVALID_FORMAT');
    }

    // Parse the wildcard path to extract segments and method
    const segments = wildcardPath.split('/').filter(s => s.length > 0);

    if (segments.length === 0) {
        throw HttpErrors.badRequest('Endpoint path is required', 'ENDPOINT_MISSING');
    }

    // Last segment should be HTTP method (GET, POST, PUT, DELETE)
    const method = segments[segments.length - 1].toUpperCase();
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    if (!validMethods.includes(method)) {
        throw HttpErrors.badRequest(
            `Invalid HTTP method. Expected one of: ${validMethods.join(', ')}`,
            'INVALID_METHOD'
        );
    }

    // Path segments (everything before the method)
    const pathSegments = segments.slice(0, -1);

    // Determine base directory based on environment
    const isDevelopment = process.env.NODE_ENV === 'development';
    const baseDir = isDevelopment ? 'src' : 'dist';
    const apiDir = join(process.cwd(), baseDir, 'routes/api', api.toLowerCase());

    // Known placeholder mappings (in order of likelihood)
    const placeholderMap: Record<string, string> = {
        'schema': ':schema',
        'column': ':column',
        'record': ':record',
        'relationship': ':relationship',
        'child': ':child',
    };

    // Try to find the documentation file using smart placeholder resolution
    const mdFilePath = findDocumentationFile(apiDir, pathSegments, method, placeholderMap);

    if (!mdFilePath) {
        // Build helpful error message
        const attemptedPath = segments.join('/');
        throw HttpErrors.notFound(
            `Documentation not found for endpoint: ${attemptedPath}. ` +
            `Try /docs/${api} to see available endpoints.`,
            'DOCS_NOT_FOUND'
        );
    }

    try {
        // Read markdown content
        const content = readFileSync(mdFilePath, 'utf8');

        // Set proper content-type for markdown
        context.header('Content-Type', 'text/markdown; charset=utf-8');

        // Return markdown content directly (not JSON)
        return context.text(content);
    } catch (error) {
        throw HttpErrors.internal(
            `Failed to read documentation file`,
            'DOCS_READ_ERROR'
        );
    }
}

/**
 * Find documentation file using smart placeholder resolution
 *
 * Strategy:
 * 1. Try exact path first (no placeholders)
 * 2. Try with single placeholders in each position
 * 3. Try with multiple placeholders in common patterns
 *
 * Examples:
 * - ['schema', 'column'] + GET → try :schema/:column/GET.md
 * - ['schema'] + GET → try :schema/GET.md
 * - ['schema', 'record', 'relationship'] + GET → try :schema/:record/:relationship/GET.md
 */
function findDocumentationFile(
    apiDir: string,
    pathSegments: string[],
    method: string,
    placeholderMap: Record<string, string>
): string | null {
    // Build all possible path combinations to try
    const pathsToTry: string[] = [];

    if (pathSegments.length === 0) {
        // Root endpoint (e.g., /docs/describe/GET → describe/GET.md)
        pathsToTry.push(join(apiDir, `${method}.md`));
    } else {
        // Try exact path first
        const exactPath = join(apiDir, ...pathSegments, `${method}.md`);
        pathsToTry.push(exactPath);

        // Try with placeholders
        // For each segment, try replacing it with its placeholder
        const placeholderCombinations = generatePlaceholderCombinations(
            pathSegments,
            placeholderMap
        );

        for (const combination of placeholderCombinations) {
            const path = join(apiDir, ...combination, `${method}.md`);
            pathsToTry.push(path);
        }
    }

    // Try each path in order until we find one that exists
    for (const path of pathsToTry) {
        if (existsSync(path)) {
            return path;
        }
    }

    return null;
}

/**
 * Generate all reasonable placeholder combinations for path segments
 *
 * Strategy: Replace segments with their placeholder equivalents in order
 * Example: ['schema', 'column'] → [':schema', ':column']
 */
function generatePlaceholderCombinations(
    segments: string[],
    placeholderMap: Record<string, string>
): string[][] {
    const combinations: string[][] = [];

    // Strategy 1: Replace all known segments with placeholders
    const allPlaceholders = segments.map(seg =>
        placeholderMap[seg.toLowerCase()] || seg
    );

    // Only add if it's different from original (has at least one placeholder)
    if (allPlaceholders.some((seg, i) => seg !== segments[i])) {
        combinations.push(allPlaceholders);
    }

    // Strategy 2: For common patterns, try specific combinations
    // Pattern: schema/column → :schema/:column
    if (segments.length === 2 && segments[0] === 'schema' && segments[1] === 'column') {
        combinations.push([':schema', ':column']);
    }

    // Pattern: schema/record → :schema/:record
    if (segments.length === 2 && segments[0] === 'schema' && segments[1] === 'record') {
        combinations.push([':schema', ':record']);
    }

    // Pattern: schema/record/relationship → :schema/:record/:relationship
    if (segments.length === 3 && segments[0] === 'schema' && segments[1] === 'record') {
        combinations.push([':schema', ':record', ':relationship']);
    }

    // Pattern: schema/record/relationship/child → :schema/:record/:relationship/:child
    if (segments.length === 4) {
        combinations.push([':schema', ':record', ':relationship', ':child']);
    }

    return combinations;
}
