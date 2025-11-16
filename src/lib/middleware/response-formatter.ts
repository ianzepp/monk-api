/**
 * Response Formatter Middleware
 *
 * Automatically formats route results based on detected format preference.
 * Works transparently with existing routes - they continue to use context.json()
 * and this middleware intercepts to encode in the requested format.
 */

import type { Context, Next } from 'hono';
import type { ResponseFormat } from './format-detection.js';
import { JsonFormatter, ToonFormatter, YamlFormatter, BrainfuckFormatter } from '@src/lib/formatters/index.js';

/**
 * Response formatter middleware
 * Intercepts JSON responses and converts to requested format
 */
export async function responseFormatterMiddleware(context: Context, next: Next) {
    const format = context.get('responseFormat') as ResponseFormat;

    // Store original json method
    const originalJson = context.json.bind(context);

    // Override context.json to encode in requested format
    context.json = function (data: any, init?: any) {
        try {
            let formattedString: string;
            let contentType: string;

            // Select formatter based on format
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

                case 'json':
                default:
                    // Use original JSON for default case
                    return originalJson(data, init);
            }

            // Return formatted response
            return context.text(formattedString, init, {
                'Content-Type': contentType,
            });
        } catch (error) {
            // If formatting fails, fall back to JSON
            console.error(`${format.toUpperCase()} encoding failed, falling back to JSON:`, error);
            return originalJson(data, init);
        }
    } as any; // Type assertion needed for Hono method override

    await next();
}
