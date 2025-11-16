/**
 * Brainfuck Response Middleware
 *
 * Automatically formats route results as Brainfuck when requested.
 * Works transparently with existing routes - they continue to use context.json()
 * and this middleware intercepts to encode as Brainfuck when format is detected.
 *
 * Converts JSON response to Brainfuck code that outputs the JSON string.
 * This is completely impractical but wonderfully terrible.
 */

import type { Context, Next } from 'hono';
import type { ResponseFormat } from './format-detection.js';

/**
 * Converts a string to Brainfuck code that outputs that string
 * Uses a simple character-by-character encoding strategy
 */
function stringToBrainfuck(text: string): string {
    let brainfuck = '';
    let currentValue = 0;

    for (let i = 0; i < text.length; i++) {
        const targetValue = text.charCodeAt(i);
        const diff = targetValue - currentValue;

        if (diff > 0) {
            // Increase cell value
            brainfuck += '+'.repeat(diff);
        } else if (diff < 0) {
            // Decrease cell value
            brainfuck += '-'.repeat(-diff);
        }

        // Output the character
        brainfuck += '.';
        currentValue = targetValue;
    }

    return brainfuck;
}

/**
 * Brainfuck response middleware
 * Intercepts JSON responses and converts to Brainfuck when format is 'brainfuck'
 */
export async function responseBrainfuckMiddleware(context: Context, next: Next) {
    const format = context.get('responseFormat') as ResponseFormat;

    // If not Brainfuck format, continue normally
    if (format !== 'brainfuck') {
        await next();
        return;
    }

    // Store original json method
    const originalJson = context.json.bind(context);

    // Override context.json to encode as Brainfuck
    context.json = function (data: any, init?: any) {
        try {
            // Convert data to JSON string
            const jsonString = JSON.stringify(data, null, 2);

            // Encode JSON string to Brainfuck
            const brainfuckCode = stringToBrainfuck(jsonString);

            // Return as text/plain with Brainfuck code
            return context.text(brainfuckCode, init, {
                'Content-Type': 'text/plain; charset=utf-8',
            });
        } catch (error) {
            // If Brainfuck encoding fails, fall back to JSON
            console.error('Brainfuck encoding failed, falling back to JSON:', error);
            return originalJson(data, init);
        }
    } as any; // Type assertion needed for Hono method override

    await next();
}
