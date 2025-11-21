import type { Context } from 'hono';
import { getDatabasePoolStats } from '@src/db/index.js';

/**
 * GET /test/pools
 *
 * Get statistics about current database connection pools.
 * This endpoint is only available in development/test environments.
 *
 * Returns:
 * - totalPools: Total number of active connection pools
 * - testPools: Number of test database pools (test_ prefix)
 * - tenantPools: Number of tenant database pools (tenant_ prefix)
 * - databases: Array of all database names with active pools
 */
export default async function (context: Context) {
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
        return context.json(
            {
                success: false,
                error: 'Test utilities are only available in development/test environments',
                error_code: 'TEST_ENDPOINT_DISABLED',
            },
            403
        );
    }

    try {
        const stats = getDatabasePoolStats();

        return context.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        return context.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get pool stats',
                error_code: 'POOL_STATS_FAILED',
            },
            500
        );
    }
}
