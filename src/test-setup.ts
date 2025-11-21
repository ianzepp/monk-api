// Test setup - runs before all tests
import { beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

beforeAll(async () => {
    console.info('🧪 Setting up test environment...');
    console.info('✅ Configuration loaded for tests');
});

afterAll(async () => {
    console.info('🧹 Cleaning up test environment...');
    // TODO: Clean up test data if needed
});
