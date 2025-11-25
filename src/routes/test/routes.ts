/**
 * Test Route Barrel Export
 *
 * Test utility routes (public, no JWT required):
 * - GET /test/pools: Get database connection pool statistics
 * - DELETE /test/pools: Close all test database connection pools
 *
 * These routes are only available in development/test environments.
 * They help manage database connection pools during test execution.
 */

export { default as PoolsGet } from './pools/GET.js';
export { default as PoolsDelete } from './pools/DELETE.js';
