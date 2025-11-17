/**
 * Field Extraction Middleware
 *
 * Provides server-side field extraction via ?pick= query parameter.
 *
 * Runs AFTER response creation but BEFORE formatting, allowing extracted fields
 * to be formatted in any supported format (JSON, TOON, YAML, etc.)
 *
 * Always returns JSON (single values or objects), which is then processed by
 * the formatter middleware for consistent behavior.
 *
 * Examples:
 *   GET /api/auth/whoami?pick=data.id
 *   → Returns: "c81d0a9b-8d9a-4daf-9f45-08eb8bc3805c" (JSON string)
 *
 *   GET /api/auth/whoami?pick=data.id,data.name
 *   → Returns: {"id":"c81d0a9b...","name":"Demo User"} (JSON object)
 *
 *   GET /api/auth/whoami?pick=data.user&format=yaml
 *   → Extracts data.user as JSON, then formatter converts to YAML
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

        // Always return JSON - let formatter middleware handle encoding
        // This ensures consistent behavior: field extraction → JSON → formatter → final format
        // Note: undefined is not valid JSON, so convert to null
        const jsonValue = extracted === undefined ? null : extracted;
        context.res = context.json(jsonValue, response.status as any);

    } catch (error) {
        // If extraction fails, return original response
        console.error('Field extraction failed, returning original response:', error);
        // context.res is already set to original response, so just return
        return;
    }
}
