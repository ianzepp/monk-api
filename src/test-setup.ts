// Test setup - runs before all tests
import { beforeAll, afterAll } from 'vitest';
import { MonkEnv } from '@src/lib/monk-env.js';
import { logger } from '@src/lib/logger.js';

beforeAll(async () => {
    console.log('🧪 Setting up test environment...');
    
    // Load monk configuration into process.env before any database operations
    MonkEnv.loadIntoProcessEnv();
    
    // Set up global logger for tests
    global.logger = logger;
    
    console.log('✅ Configuration loaded for tests');
});

afterAll(async () => {
    console.log('🧹 Cleaning up test environment...');
    // TODO: Clean up test data if needed
});