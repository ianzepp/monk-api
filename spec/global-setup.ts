/**
 * Vitest Global Setup
 *
 * This file is executed once before all tests run and once after all tests complete.
 * It's configured in vitest.config.ts via the globalSetup option.
 *
 * Purpose:
 * - Verify that the test server is running before tests start
 * - Cleanup test resources after all tests complete
 *
 * Note: This does NOT build code or start the server - those are handled by
 * the test-ts.sh wrapper script. This only verifies prerequisites are met.
 */

import { TestInfrastructure } from './test-infrastructure.js';

/**
 * Setup function - runs once before all tests
 *
 * Verifies that:
 * 1. The test server is running on port 9001
 * 2. The server is responding to requests
 *
 * If the server is not running, this throws a clear error explaining
 * how to start it (via npm run test:ts).
 */
export async function setup() {
    await TestInfrastructure.initialize();
}

/**
 * Teardown function - runs once after all tests
 *
 * Performs cleanup tasks:
 * - Logs cleanup completion
 * - Removes test tenants (names starting with 'test_') after the test suite
 */
export async function teardown() {
    await TestInfrastructure.cleanup();
}
