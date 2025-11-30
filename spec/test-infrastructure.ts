/**
 * Test Infrastructure
 *
 * Global test infrastructure for verifying server readiness and managing
 * test suite lifecycle. This module is called by the vitest global setup.
 */

import { spawn, type ChildProcess } from 'child_process';
import { TEST_CONFIG } from './test-config.js';

export class TestInfrastructure {
    private static serverReady = false;
    private static serverProcess: ChildProcess | null = null;

    /**
     * Initialize test infrastructure
     *
     * This is called once at the start of the test suite (via globalSetup).
     * It verifies that:
     * 1. The API server is running on the test port (9001)
     * 2. The server is responding to requests
     *
     * If the server is not running, it will attempt to start it automatically.
     */
    static async initialize(): Promise<void> {
        console.log(`\n🔍 Verifying test server on ${TEST_CONFIG.API_URL}...`);

        // Check if server is already running
        if (await this.checkServerHealth()) {
            this.serverReady = true;
            console.log(`✅ Test server already running on port ${TEST_CONFIG.PORT}\n`);
            return;
        }

        // Server not running - start it
        console.log(`⚙️  Starting test server on port ${TEST_CONFIG.PORT}...`);

        let serverError = '';

        this.serverProcess = spawn('bun', ['run', 'dist/index.js'], {
            env: { ...process.env, PORT: String(TEST_CONFIG.PORT) },
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
        });

        // Capture stderr for debugging
        this.serverProcess.stderr?.on('data', (data) => {
            serverError += data.toString();
        });

        this.serverProcess.on('error', (err) => {
            serverError = err.message;
        });

        // Wait for server to be ready
        const maxWait = 20000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            // Check if process died
            if (this.serverProcess.exitCode !== null) {
                throw new Error(
                    `\n❌ Test server process exited with code ${this.serverProcess.exitCode}\n` +
                        `Error: ${serverError || 'No error output'}\n`
                );
            }

            if (await this.checkServerHealth()) {
                this.serverReady = true;
                console.log(`✅ Test server ready on port ${TEST_CONFIG.PORT}\n`);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Timeout - kill process and throw
        this.serverProcess?.kill();
        throw new Error(
            `\n❌ Failed to start test server on ${TEST_CONFIG.API_URL} within ${maxWait}ms\n\n` +
                `Server output: ${serverError || 'No error output'}\n` +
                `Make sure the code is built: npm run build\n`
        );
    }

    /**
     * Check if server responds to health endpoint
     */
    private static async checkServerHealth(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(`${TEST_CONFIG.API_URL}/health`, {
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
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
     * - Stopping the server if we started it
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
        } catch (error) {
            // Ignore - server might already be down
        }

        // Kill server if we started it
        if (this.serverProcess) {
            console.log(`🛑 Stopping test server...`);
            this.serverProcess.kill();
            this.serverProcess = null;
        }

        console.log(`✅ Test infrastructure cleanup completed\n`);
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
