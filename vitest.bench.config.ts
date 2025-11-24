/**
 * Vitest Configuration for Benchmark Tests
 *
 * Benchmarks measure performance of API operations.
 * These are integration tests that require a running server and database.
 *
 * Run with: npm run test:bench
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        testTimeout: 120000, // 2 minutes per benchmark
        hookTimeout: 60000,
        globalSetup: ['./spec/global-setup.ts'],
        setupFiles: ['./src/test-setup.ts'],
        include: ['spec/**/*.bench.ts'],
        // Benchmark mode
        benchmark: {
            include: ['spec/**/*.bench.ts'],
            reporters: ['default'],
        },
        // Run sequentially
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
