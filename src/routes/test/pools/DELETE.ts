import type { Context } from 'hono';
import { closeTestDatabasePools, getDatabasePoolStats } from '@src/db/index.js';

/**
 * DELETE /test/pools
 *
 * Close all test database connection pools to free up PostgreSQL connections.
 * This endpoint is only available in development/test environments.
 *
 * Use case: During test execution, multiple test databases are created,
 * each with its own connection pool. This can exhaust PostgreSQL's max_connections.
 * This endpoint allows tests to clean up pools periodically.
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
        const statsBefore = getDatabasePoolStats();
        await closeTestDatabasePools();
        const statsAfter = getDatabasePoolStats();

        return context.json({
            success: true,
            data: {
                poolsClosed: statsBefore.testPools,
                poolsRemaining: statsAfter.totalPools,
                statsBefore,
                statsAfter,
            },
        });
    } catch (error) {
        return context.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to close test pools',
                error_code: 'POOL_CLEANUP_FAILED',
            },
            500
        );
    }
}
