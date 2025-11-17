/**
 * Field Extraction Middleware
 *
 * Provides server-side field extraction and system field filtering via query parameters.
 *
 * Runs AFTER response creation but BEFORE formatting, allowing extracted/filtered fields
 * to be formatted in any supported format (JSON, TOON, YAML, etc.)
 *
 * Always returns JSON (single values or objects), which is then processed by
 * the formatter middleware for consistent behavior.
 *
 * Query Parameters:
 *   ?pick=       - Extract specific fields from response
 *   ?stat=false  - Exclude timestamp fields (created_at, updated_at, trashed_at, deleted_at)
 *   ?access=false - Exclude ACL fields (access_read, access_edit, access_full, access_deny)
 *
 * Examples:
 *   GET /api/auth/whoami?pick=data.id
 *   → Returns: "c81d0a9b-8d9a-4daf-9f45-08eb8bc3805c" (JSON string)
 *
 *   GET /api/data/users?access=false
 *   → Returns records without ACL fields
 *
 *   GET /api/data/users?stat=false&access=false&pick=data
 *   → Returns data array without system fields
 */

import type { Context, Next } from 'hono';
import { extract } from '@src/lib/field-extractor.js';

/**
 * Filter system fields from data based on query parameters
 *
 * @param data - Data to filter (object, array, or primitive)
 * @param includeStat - Whether to include stat fields (created_at, updated_at, etc.)
 * @param includeAccess - Whether to include access fields (access_read, access_edit, etc.)
 * @returns Filtered data
 */
function filterSystemFields(data: any, includeStat: boolean, includeAccess: boolean): any {
    if (!data) return data;

    // Handle arrays - recursively filter each item
    if (Array.isArray(data)) {
        return data.map(item => filterSystemFields(item, includeStat, includeAccess));
    }

    // Handle objects - filter system fields
    if (typeof data === 'object') {
        const filtered = { ...data };

        if (!includeStat) {
            delete filtered.created_at;
            delete filtered.updated_at;
            delete filtered.trashed_at;
            delete filtered.deleted_at;
        }

        if (!includeAccess) {
            delete filtered.access_read;
            delete filtered.access_edit;
            delete filtered.access_full;
            delete filtered.access_deny;
        }

        return filtered;
    }

    // Primitives pass through unchanged
    return data;
}

/**
 * Field extraction middleware - filters system fields and extracts specific fields from successful responses
 *
 * Operates transparently at the API boundary:
 * - Routes create full JSON responses as normal
 * - This middleware filters system fields if ?stat=false or ?access=false
 * - This middleware extracts requested fields if ?pick= is specified
 * - Formatter middleware then encodes the extracted/filtered data
 *
 * Only processes successful responses - errors pass through unchanged.
 */
export async function fieldExtractionMiddleware(context: Context, next: Next) {
    // Execute route handler and any middleware that creates responses
    await next();

    // Only process if response is finalized
    if (!context.finalized) {
        return;
    }

    // Check for any processing parameters
    const pickParam = context.req.query('pick');
    const statParam = context.req.query('stat');
    const accessParam = context.req.query('access');

    // Determine if any processing is needed
    const needsPick = pickParam && pickParam.trim() !== '';
    const needsFiltering = statParam === 'false' || accessParam === 'false';

    if (!needsPick && !needsFiltering) {
        return; // No processing requested
    }

    // Clone the response to read its body without consuming the original
    const response = context.res;
    const clonedResponse = response.clone();

    try {
        // Only process JSON responses (which includes our API responses)
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            return; // Not a JSON response, skip processing
        }

        // Read the response body
        let responseData: any = await clonedResponse.json();

        // Only process successful responses
        if (responseData.success !== true) {
            return; // Error response, skip processing
        }

        // Step 1: Filter system fields BEFORE extraction (if requested)
        // This ensures ?pick= operates on filtered data
        if (needsFiltering) {
            const includeStat = statParam !== 'false';
            const includeAccess = accessParam !== 'false';

            if (responseData.data !== undefined) {
                responseData.data = filterSystemFields(responseData.data, includeStat, includeAccess);
            }
        }

        // Step 2: Extract specific fields (if requested)
        let result = responseData;
        if (needsPick) {
            result = extract(responseData, pickParam as string);
        }

        // Reset response to avoid header merging
        context.res = undefined;

        // Always return JSON - let formatter middleware handle encoding
        // This ensures consistent behavior: filtering → extraction → JSON → formatter → final format
        // Note: undefined is not valid JSON, so convert to null
        const jsonValue = result === undefined ? null : result;
        context.res = context.json(jsonValue, response.status as any);

    } catch (error) {
        // If processing fails, return original response
        console.error('Field extraction/filtering failed, returning original response:', error);
        // context.res is already set to original response, so just return
        return;
    }
}
