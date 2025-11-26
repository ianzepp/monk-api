// Test setup - runs before all tests
import { beforeAll, afterAll } from 'vitest';
import { loadEnv } from '@src/lib/env/load-env.js';

// Load environment variables from .env file
loadEnv();

beforeAll(async () => {
    console.info('🧪 Setting up test environment...');
    console.info('✅ Configuration loaded for tests');
});

afterAll(async () => {
    console.info('🧹 Cleaning up test environment...');
    // TODO: Clean up test data if needed
});
