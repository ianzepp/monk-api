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
 *   ?unwrap      - Remove envelope, return full data object
 *   ?select=     - Remove envelope, return specific fields from data
 *   ?stat=false  - Exclude timestamp fields (created_at, updated_at, trashed_at, deleted_at)
 *   ?access=false - Exclude ACL fields (access_read, access_edit, access_full, access_deny)
 *
 * Examples:
 *   GET /api/auth/whoami?unwrap
 *   → Returns: {"id": "...", "name": "...", "access": "root", ...}
 *
 *   GET /api/auth/whoami?select=id
 *   → Returns: "c81d0a9b-8d9a-4daf-9f45-08eb8bc3805c" (JSON string)
 *
 *   GET /api/auth/whoami?select=id,name
 *   → Returns: {"id": "...", "name": "..."}
 *
 *   GET /api/data/users?access=false
 *   → Returns records without ACL fields
 *
 *   GET /api/data/users?stat=false&access=false&unwrap
 *   → Returns data array without system fields or envelope
 */

import type { Context, Next } from 'hono';
import { extract } from '@src/lib/field-extractor.js';
import { filterSystemFields } from '@src/lib/system-field-filter.js';

/**
 * Field extraction middleware - filters system fields and extracts/unwraps data from successful responses
 *
 * Operates transparently at the API boundary:
 * - Routes create full JSON responses as normal
 * - This middleware filters system fields if ?stat=false or ?access=false
 * - This middleware unwraps envelope if ?unwrap is specified
 * - This middleware extracts specific fields if ?select= is specified (implies unwrap)
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
    const unwrapParam = context.req.query('unwrap');
    const selectParam = context.req.query('select');
    const statParam = context.req.query('stat');
    const accessParam = context.req.query('access');

    // Determine if any processing is needed
    const needsUnwrap = unwrapParam !== undefined;
    const needsSelect = selectParam && selectParam.trim() !== '';
    const needsFiltering = statParam === 'false' || accessParam === 'false';

    if (!needsUnwrap && !needsSelect && !needsFiltering) {
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

        // Step 1: Filter system fields BEFORE unwrap/select (if requested)
        // This ensures ?unwrap/?select= operate on filtered data
        if (needsFiltering) {
            const includeStat = statParam !== 'false';
            const includeAccess = accessParam !== 'false';

            if (responseData.data !== undefined) {
                responseData.data = filterSystemFields(responseData.data, includeStat, includeAccess);
            }
        }

        // Step 2: Unwrap or select fields (if requested)
        let result = responseData;

        if (needsSelect) {
            // select implies unwrap + field filtering
            // Prepend "data." to each path since select operates within data scope
            const paths = (selectParam as string)
                .split(',')
                .map(p => `data.${p.trim()}`)
                .join(',');
            result = extract(responseData, paths);
        } else if (needsUnwrap) {
            // unwrap without select = return full data object
            result = extract(responseData, 'data');
        }

        // Reset response to avoid header merging
        context.res = undefined;

        // Always return JSON - let formatter middleware handle encoding
        // This ensures consistent behavior: filtering → unwrap/select → JSON → formatter → final format
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
