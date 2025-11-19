/**
 * Test Configuration
 *
 * Centralized configuration for the test suite.
 * All test infrastructure and test files should import from here.
 */

export const TEST_CONFIG = {
    /**
     * API Server URL for tests
     * Default: http://localhost:9002 (port 9002 to avoid conflicts with dev server on 9001)
     */
    API_URL: process.env.TEST_API_URL || 'http://localhost:9002',

    /**
     * API Server Port for tests
     * Default: 9002 (to avoid conflicts with dev server on 9001)
     */
    PORT: parseInt(process.env.TEST_PORT || '9002', 10),

    /**
     * Default template for test tenants
     *
     * Default: 'default' - The standard monk-api template with:
     *   - System schemas (schemas, columns, users, etc.)
     *   - Default 'root' user (full permissions)
     *   - No additional test data
     *
     * This template is always available and requires no fixture setup.
     * Tests can create their own schemas/data as needed.
     *
     * Alternative: 'testing' - Pre-populated template with test data
     *   - Requires: npm run fixtures:build testing
     *   - Contains: Sample accounts, contacts, relationships
     *   - Best for: Tests that need existing data to query
     */
    DEFAULT_TEMPLATE: process.env.TEST_TEMPLATE || 'default',

    /**
     * Server readiness check timeout (ms)
     * How long to wait for server to respond before failing
     */
    SERVER_CHECK_TIMEOUT: 5000,

    /**
     * Server startup wait time (ms)
     * How long to wait after server starts before running tests
     */
    SERVER_STARTUP_WAIT: 3000,
} as const;
