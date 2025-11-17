// Test setup - runs before all tests
import { beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import { logger } from '@src/lib/logger.js';

// Load environment variables from .env file
config();

beforeAll(async () => {
    logger.info('🧪 Setting up test environment...');

    // Set up global logger for tests
    global.logger = logger;

    logger.info('✅ Configuration loaded for tests');
});

afterAll(async () => {
    logger.info('🧹 Cleaning up test environment...');
    // TODO: Clean up test data if needed
});
