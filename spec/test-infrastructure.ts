/**
 * Test Infrastructure
 *
 * Global test infrastructure for verifying server readiness and managing
 * test suite lifecycle. This module is called by the vitest global setup.
 */

import { TEST_CONFIG } from './test-config.js';

export class TestInfrastructure {
    private static serverReady = false;

    /**
     * Initialize test infrastructure
     *
     * This is called once at the start of the test suite (via globalSetup).
     * It verifies that:
     * 1. The API server is running on the test port (9002)
     * 2. The server is responding to requests
     *
     * If the server is not running, this throws a clear error message
     * explaining how to start the server.
     *
     * NOTE: This does NOT start the server - that's done by test-ts.sh wrapper.
     * Tests should verify prerequisites, not create them.
     */
    static async initialize(): Promise<void> {
        console.log(`\n🔍 Verifying test server on ${TEST_CONFIG.API_URL}...`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TEST_CONFIG.SERVER_CHECK_TIMEOUT);

            const response = await fetch(`${TEST_CONFIG.API_URL}/`, {
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Server responded - we're good!
            this.serverReady = true;
            console.log(`✅ Test server ready on port ${TEST_CONFIG.PORT}`);
            console.log(`   Status: ${response.status} ${response.statusText}\n`);
        } catch (error) {
            // Server not running or not responding
            throw new Error(
                `\n❌ Test server not running on ${TEST_CONFIG.API_URL}!\n\n` +
                    `Prerequisites for running tests:\n` +
                    `  1. npm run build              # Build the code first\n` +
                    `  2. PORT=${TEST_CONFIG.PORT} npm run start:bg   # Start test server\n` +
                    `  3. npx vitest                 # Run tests\n\n` +
                    `OR use the wrapper script that handles everything:\n` +
                    `  npm run test:ts               # Builds, starts server, runs tests\n\n` +
                    `Error: ${error instanceof Error ? error.message : String(error)}\n`
            );
        }
    }

    /**
     * Check if server is ready
     *
     * @returns true if server was verified during initialization
     */
    static isServerReady(): boolean {
        return this.serverReady;
    }

    /**
     * Cleanup test infrastructure
     *
     * This is called once at the end of the test suite (via globalSetup teardown).
     * It performs cleanup tasks like:
     * - Closing all test database connection pools
     * - Cleaning up all test tenants (tenants with names starting with 'test_')
     *
     * NOTE: This does NOT stop the server - that's done by test-ts.sh wrapper.
     */
    static async cleanup(): Promise<void> {
        console.log(`\n🧹 Cleaning up test infrastructure...`);

        try {
            // Close all test database pools first to free up PostgreSQL connections
            const poolsResponse = await fetch(`${TEST_CONFIG.API_URL}/test/pools`, {
                method: 'DELETE',
            });

            if (poolsResponse.ok) {
                const poolsData = await poolsResponse.json() as any;
                if (poolsData.success && poolsData.data?.poolsClosed > 0) {
                    console.log(`✅ Closed ${poolsData.data.poolsClosed} test database pool(s)`);
                }
            }

            console.log(`✅ Test infrastructure cleanup completed\n`);
        } catch (error) {
            console.warn(`⚠️  Cleanup encountered issues (may be expected): ${error}\n`);
        }
    }

    /**
     * Wait for server startup
     *
     * Helper to wait a bit after server starts to ensure it's fully ready.
     * This is used by test-ts.sh after starting the background server.
     *
     * @param ms - Milliseconds to wait (default: SERVER_STARTUP_WAIT from config)
     */
    static async waitForStartup(ms: number = TEST_CONFIG.SERVER_STARTUP_WAIT): Promise<void> {
        console.log(`⏳ Waiting ${ms}ms for server startup...`);
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
