/**
 * YAML Response Middleware
 *
 * Automatically formats route results as YAML when requested.
 * Works transparently with existing routes - they continue to use context.json()
 * and this middleware intercepts to encode as YAML when format is detected.
 *
 * Handles both success and error responses in YAML format.
 */

import type { Context, Next } from 'hono';
import { dump } from 'js-yaml';
import type { ResponseFormat } from './format-detection.js';

/**
 * YAML response middleware
 * Intercepts JSON responses and converts to YAML when format is 'yaml'
 */
export async function responseYamlFormatMiddleware(context: Context, next: Next) {
    const format = context.get('responseFormat') as ResponseFormat;

    // If not YAML format, continue normally
    if (format !== 'yaml') {
        await next();
        return;
    }

    // Store original json method
    const originalJson = context.json.bind(context);

    // Override context.json to encode as YAML
    context.json = function (data: any, init?: any) {
        try {
            // Encode data to YAML format
            const yamlString = dump(data, {
                indent: 2,
                lineWidth: 120,
                noRefs: true,
                sortKeys: false,
            });

            // Return as text/yaml with YAML content
            return context.text(yamlString, init, {
                'Content-Type': 'application/yaml; charset=utf-8',
            });
        } catch (error) {
            // If YAML encoding fails, fall back to JSON
            console.error('YAML encoding failed, falling back to JSON:', error);
            return originalJson(data, init);
        }
    } as any; // Type assertion needed for Hono method override

    await next();
}
