/**
 * Bun Test Preload Script
 *
 * This file is executed before tests run via the preload option in bunfig.toml.
 * It replaces the vitest global-setup.ts and test-setup.ts functionality.
 *
 * Purpose:
 * - Load environment variables
 * - Verify that the test server is running before tests start
 * - Register cleanup for after tests complete
 */

import { TestInfrastructure } from './test-infrastructure.js';
import { loadEnv } from '@src/lib/env/load-env.js';

// Load environment variables from .env file
loadEnv();

// Initialize test infrastructure (verify server is running)
await TestInfrastructure.initialize();

// Register cleanup on process exit
process.on('beforeExit', async () => {
    await TestInfrastructure.cleanup();
});
