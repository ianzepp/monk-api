import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        testTimeout: 30000,
        globalSetup: ['./spec/global-setup.ts'],
        setupFiles: ['./src/test-setup.ts'],
        include: ['spec/**/*.test.ts'],
        typecheck: {
            tsconfig: './tsconfig.spec.json',
        },
        // Run test files sequentially to prevent PostgreSQL connection exhaustion
        // Each test file creates multiple tenant databases, each with connection pools
        // Running sequentially ensures we don't exceed max_connections
        fileParallelism: false,
        maxConcurrency: 1,
    },
    resolve: {
        alias: {
            '@src': resolve(__dirname, 'src'),
            '@lib': resolve(__dirname, 'src/lib'),
            '@observers': resolve(__dirname, 'src/lib/observers'),
            '@routes': resolve(__dirname, 'src/routes'),
            '@spec': resolve(__dirname, 'spec'),
            '@sql': resolve(__dirname, 'src/lib/sql'),
        },
    },
});