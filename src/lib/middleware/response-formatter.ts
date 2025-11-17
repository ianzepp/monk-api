/**
 * Response Formatter Middleware
 *
 * Automatically formats route results based on detected format preference.
 * Works transparently with existing routes - they continue to use context.json()
 * and this middleware intercepts to encode in the requested format.
 */

import type { Context, Next } from 'hono';
import type { ResponseFormat } from './format-detection.js';
import { JsonFormatter, ToonFormatter, YamlFormatter, BrainfuckFormatter, MorseFormatter, QrFormatter, MarkdownFormatter } from '@src/lib/formatters/index.js';

/**
 * Response formatter middleware - Transparent JSON boundary codec
 *
 * IMPORTANT: This middleware overrides context.json() to transparently transform
 * JSON responses into other formats (TOON, YAML, etc.) based on client preference.
 *
 * Routes remain completely unaware - they call context.json() and formatters
 * handle the encoding at the API boundary. This is transparent to all route logic.
 *
 * When format !== 'json', calling context.json(data) will:
 *   1. Encode the JavaScript object to the requested format string
 *   2. Return context.text(formatted) with appropriate Content-Type header
 *   3. Fall back to JSON on any encoding errors
 */
export async function responseFormatterMiddleware(context: Context, next: Next) {
    const format = context.get('responseFormat') as ResponseFormat;

    // Store original json method
    const originalJson = context.json.bind(context);

    // Override context.json to transparently encode in requested format (if not JSON)
    // Routes call context.json() as normal - we intercept and transform
    if (format && format !== 'json') {
        context.json = function (data: any, init?: any) {
            try {
                let formattedString: string;
                let contentType: string;

                // Select formatter based on client preference
                switch (format) {
                    case 'toon':
                        formattedString = ToonFormatter.encode(data);
                        contentType = ToonFormatter.contentType;
                        break;

                    case 'yaml':
                        formattedString = YamlFormatter.encode(data);
                        contentType = YamlFormatter.contentType;
                        break;

                    case 'brainfuck':
                        formattedString = BrainfuckFormatter.encode(data);
                        contentType = BrainfuckFormatter.contentType;
                        break;

                    case 'morse':
                        formattedString = MorseFormatter.encode(data);
                        contentType = MorseFormatter.contentType;
                        break;

                    case 'qr':
                        formattedString = QrFormatter.encode(data);
                        contentType = QrFormatter.contentType;
                        break;

                    case 'markdown':
                        formattedString = MarkdownFormatter.encode(data);
                        contentType = MarkdownFormatter.contentType;
                        break;

                    default:
                        // Fallback to original JSON for unknown formats
                        return originalJson(data, init);
                }

                // Use Hono's text method for proper @hono/node-server compatibility
                const status = typeof init === 'number' ? init : init?.status || 200;
                return context.text(formattedString, status, {
                    'Content-Type': contentType,
                });
            } catch (error) {
                // If formatting fails, gracefully fall back to JSON
                console.error(`${format.toUpperCase()} encoding failed, falling back to JSON:`, error);
                return originalJson(data, init);
            }
        } as any; // Type assertion needed for Hono method override
    }

    // Call route handler (which may call overridden context.json)
    await next();

    // Safety check: don't interfere if response already finalized
    if (context.finalized) {
        return;
    }

    // Note: Response creation for setRouteResult() is now handled by systemContextMiddleware
    // This middleware ONLY handles transparent format encoding via context.json() override
}
