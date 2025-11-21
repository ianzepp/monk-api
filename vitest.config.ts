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
        // Limit concurrent test files to prevent PostgreSQL connection exhaustion
        // Each test file creates multiple tenant databases, each with connection pools
        // Math: 5 files × ~3 tenants × 2 connections = ~30 concurrent connections (safe)
        fileParallelism: true,
        maxConcurrency: 5,
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