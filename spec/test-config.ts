/**
 * Test Configuration
 *
 * Centralized configuration for the test suite.
 * All test infrastructure and test files should import from here.
 */

export const TEST_CONFIG = {
    /**
     * API Server URL for tests
     * Default: http://localhost:9001 (single port for all environments)
     */
    API_URL: process.env.TEST_API_URL || 'http://localhost:9001',

    /**
     * API Server Port for tests
     * Default: 9001 (single port for all environments)
     */
    PORT: parseInt(process.env.TEST_PORT || '9001', 10),

    /**
     * Default template for test tenants
     *
     * Default: 'system' - The standard monk-api template with:
     *   - System models (models, fields, users, etc.)
     *   - Default 'root' user (full permissions)
     *   - No additional test data
     *
     * This template is always available and requires no fixture setup.
     * Tests can create their own models/data as needed.
     *
     * Alternative: 'testing' - Pre-populated template with test data
     *   - Requires: npm run fixtures:build testing
     *   - Contains: Sample accounts, contacts, relationships
     *   - Best for: Tests that need existing data to query
     */
    DEFAULT_TEMPLATE: process.env.TEST_TEMPLATE || 'system',

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

    /**
     * Database types to test against
     *
     * Default: ['postgresql'] - Only PostgreSQL
     * Set TEST_DB_TYPES=postgresql,sqlite to test both backends
     *
     * Used by describeForAllDbTypes() to run tests against multiple backends.
     */
    DB_TYPES: (process.env.TEST_DB_TYPES || 'postgresql').split(',') as ('postgresql' | 'sqlite')[],
} as const;
