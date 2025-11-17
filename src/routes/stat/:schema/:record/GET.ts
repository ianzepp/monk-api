import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/http-errors.js';

/**
 * GET /api/stat/:schema/:record - Get record metadata (timestamps, etag, size)
 *
 * Returns only system metadata fields without user data.
 * Useful for cache invalidation, modification checks, and stat operations.
 *
 * Response includes:
 * - id: Record identifier
 * - created_at: Creation timestamp
 * - updated_at: Last modification timestamp
 * - trashed_at: Soft delete timestamp (null if not deleted)
 * - etag: Entity tag for caching (currently uses ID)
 * - size: Record size in bytes (TODO: currently returns 0)
 *
 * @see docs/39-stat-api.md
 */
export default withParams(async (context, { system, schema, record }) => {
    // Fetch the full record using selectOne
    const result = await system.database.selectOne(schema!, record!);

    if (!result) {
        throw HttpErrors.notFound(`Record ${record} not found in schema ${schema}`);
    }

    // Return only stat fields (exclude user data)
    const statData = {
        id: result.id,
        created_at: result.created_at,
        updated_at: result.updated_at,
        trashed_at: result.trashed_at || null,
        etag: result.id, // Use ID as etag for now
        size: 0, // TODO: Implement size calculation (user data only, exclude system fields)
    };

    setRouteResult(context, statData);
});
