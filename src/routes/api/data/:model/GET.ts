import { withSearchPath } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /api/data/:model - List all records in model
 *
 * Supports streaming via Accept header:
 * - Accept: application/json (default) - Returns JSON envelope with data array
 * - Accept: application/x-ndjson - Streams records as newline-delimited JSON
 *
 * Uses withSearchPath (not withTransaction) because:
 * - This is a read-only operation (SELECT only)
 * - Streaming requires holding connection open during response
 * - No COMMIT needed for reads (transaction scopes SET LOCAL search_path only)
 *
 * For filtered queries, use POST /api/find/:model
 * For count operations, use POST /api/aggregate/:model
 *
 * @see docs/routes/DATA_API.md
 */
function parseIntegerQueryParam(value: string | undefined, field: 'limit' | 'offset'): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw HttpErrors.badRequest(`${field} must be a non-negative integer`, `FILTER_INVALID_${field.toUpperCase()}`);
    }

    return parsed;
}

function parseJsonQueryParam(value: string | undefined, field: 'where' | 'order'): any {
    if (!value) {
        return undefined;
    }

    try {
        return JSON.parse(value);
    } catch {
        throw HttpErrors.badRequest(`Invalid JSON in ${field} query parameter`, 'JSON_PARSE_ERROR');
    }
}

export default withSearchPath(async ({ system, params, query }) => {
    const { model } = params;
    const filterData = {
        ...(query.where ? { where: parseJsonQueryParam(query.where, 'where') } : {}),
        ...(query.order ? { order: parseJsonQueryParam(query.order, 'order') } : {}),
        ...(query.select ? { select: query.select.split(',').map(field => field.trim()).filter(Boolean) } : {}),
        ...(query.limit !== undefined ? { limit: parseIntegerQueryParam(query.limit, 'limit') } : {}),
        ...(query.offset !== undefined ? { offset: parseIntegerQueryParam(query.offset, 'offset') } : {}),
    };

    // Return async generator - middleware handles streaming vs collection
    // based on client's Accept header
    return system.database.streamAny(model, filterData);
});
