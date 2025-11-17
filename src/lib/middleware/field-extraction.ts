/**
 * Field Extraction Middleware
 *
 * Provides server-side field extraction via ?pick= query parameter to simplify
 * test code by eliminating the need for `curl | jq` piping.
 *
 * Runs AFTER response creation but BEFORE formatting, allowing extracted fields
 * to be formatted in any supported format (JSON, TOON, YAML, etc.)
 *
 * Examples:
 *   GET /api/auth/whoami?pick=data.id
 *   → Returns: "c81d0a9b-8d9a-4daf-9f45-08eb8bc3805c"
 *
 *   GET /api/auth/whoami?pick=data.id,data.name
 *   → Returns: {"id":"c81d0a9b...","name":"Demo User"}
 *
 *   GET /api/auth/whoami?pick=data.user&format=yaml
 *   → Extracts data.user first, then formats as YAML
 */

import type { Context, Next } from 'hono';
import { extract } from '@src/lib/field-extractor.js';

/**
 * Field extraction middleware - extracts specific fields from successful responses
 *
 * Operates transparently at the API boundary:
 * - Routes create full JSON responses as normal
 * - This middleware extracts requested fields if ?pick= is specified
 * - Formatter middleware then encodes the extracted data
 *
 * Only processes successful responses - errors pass through unchanged.
 */
export async function fieldExtractionMiddleware(context: Context, next: Next) {
    // Execute route handler and any middleware that creates responses
    await next();

    // Only process if response is finalized and pick parameter is present
    if (!context.finalized) {
        return;
    }

    const pickParam = context.req.query('pick');
    if (!pickParam || pickParam.trim() === '') {
        return; // No extraction requested
    }

    // Clone the response to read its body without consuming the original
    const response = context.res;
    const clonedResponse = response.clone();

    try {
        // Only process JSON responses (which includes our API responses)
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            return; // Not a JSON response, skip extraction
        }

        // Read the response body
        const responseData: any = await clonedResponse.json();

        // Only extract from successful responses
        if (responseData.success !== true) {
            return; // Error response, skip extraction
        }

        // Extract the requested fields
        const extracted = extract(responseData, pickParam);

        // Reset response to avoid header merging
        context.res = undefined;

        // Handle extracted data based on type
        const isSingleField = !pickParam.includes(',');

        if (isSingleField && typeof extracted === 'string') {
            // Single string field - return as plain text for easy use in scripts
            context.res = context.text(extracted, response.status as any);
        } else if (isSingleField && (typeof extracted === 'number' || typeof extracted === 'boolean')) {
            // Single primitive - return as plain text
            context.res = context.text(String(extracted), response.status as any);
        } else {
            // Object, array, multiple fields, or null - return as JSON
            context.res = context.json(extracted, response.status as any);
        }

    } catch (error) {
        // If extraction fails, return original response
        console.error('Field extraction failed, returning original response:', error);
        // context.res is already set to original response, so just return
        return;
    }
}
