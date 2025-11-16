/**
 * Request Body Parser Middleware
 *
 * Parses request bodies based on Content-Type header.
 * Supports multiple formats to reduce token usage for LLM integrations:
 * - application/json (default)
 * - application/toon, text/plain (TOON format)
 * - application/yaml, text/yaml
 *
 * Sets context.get('parsedBody') for route handlers to consume.
 */

import type { Context, Next } from 'hono';
import { JsonFormatter, ToonFormatter, YamlFormatter } from '@src/lib/formatters/index.js';

/**
 * Parses request body based on Content-Type header
 */
export async function requestBodyParserMiddleware(context: Context, next: Next) {
    const contentType = context.req.header('content-type')?.toLowerCase() || '';

    // Skip parsing if no body (GET, DELETE, etc.)
    if (context.req.method === 'GET' || context.req.method === 'DELETE' || context.req.method === 'HEAD') {
        await next();
        return;
    }

    try {
        const rawBody = await context.req.text();

        // Skip if empty body
        if (!rawBody || rawBody.trim().length === 0) {
            await next();
            return;
        }

        let parsedBody: any;

        // Parse based on Content-Type
        if (contentType.includes('application/toon') ||
            (contentType.includes('text/plain') && rawBody.trim().startsWith('{'))) {
            // TOON format
            parsedBody = ToonFormatter.decode(rawBody);
        } else if (contentType.includes('application/yaml') ||
                   contentType.includes('application/x-yaml') ||
                   contentType.includes('text/yaml') ||
                   contentType.includes('text/x-yaml')) {
            // YAML format
            parsedBody = YamlFormatter.decode(rawBody);
        } else {
            // Default to JSON (including application/json and no Content-Type)
            parsedBody = JsonFormatter.decode(rawBody);
        }

        // Store parsed body in context for route handlers
        context.set('parsedBody', parsedBody);

        // Override context.req.json() to return parsed body
        const originalJson = context.req.json.bind(context.req);
        context.req.json = async function() {
            return parsedBody;
        } as any;

    } catch (error) {
        // If parsing fails, return error response
        return context.json({
            success: false,
            error: 'Failed to parse request body',
            error_code: 'INVALID_REQUEST_BODY',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, 400);
    }

    await next();
}
