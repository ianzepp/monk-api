/**
 * TOON Response Middleware
 *
 * Automatically formats route results as TOON when requested.
 * Works transparently with existing routes - they continue to use context.json()
 * and this middleware intercepts to encode as TOON when format is detected.
 *
 * Handles both success and error responses in TOON format.
 */

import type { Context, Next } from 'hono';
import { encode } from '@toon-format/toon';
import type { ResponseFormat } from './format-detection.js';

/**
 * TOON response middleware
 * Intercepts JSON responses and converts to TOON when format is 'toon'
 */
export async function responseToonMiddleware(context: Context, next: Next) {
    const format = context.get('responseFormat') as ResponseFormat;

    // If not TOON format, continue normally
    if (format !== 'toon') {
        await next();
        return;
    }

    // Store original json method
    const originalJson = context.json.bind(context);

    // Override context.json to encode as TOON
    context.json = function (data: any, init?: any) {
        try {
            // Encode data to TOON format
            const toonString = encode(data, {
                keyFolding: 'safe',
                indent: 2,
            });

            // Return as text/plain with TOON content
            return context.text(toonString, init, {
                'Content-Type': 'text/plain; charset=utf-8',
            });
        } catch (error) {
            // If TOON encoding fails, fall back to JSON
            console.error('TOON encoding failed, falling back to JSON:', error);
            return originalJson(data, init);
        }
    } as any; // Type assertion needed for Hono method override

    await next();
}
