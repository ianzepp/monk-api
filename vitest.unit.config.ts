/**
 * Vitest Configuration for Unit Tests
 *
 * Separate configuration for pure unit tests that don't require:
 * - Running API server
 * - Database connections
 * - Test infrastructure setup
 *
 * These tests focus on isolated component testing (Filter, validation, etc.)
 * without external dependencies.
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    resolve: {
        alias: {
            '@src': resolve(__dirname, './src'),
            '@spec': resolve(__dirname, './spec')
        }
    },
    test: {
        // No global setup - pure unit tests
        globals: false,

        // Test environment
        environment: 'node',

        // Only run tests in spec/ matching *.test.ts
        include: ['spec/**/*.test.ts'],

        // Exclude integration tests and other directories
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/disabled/**',
            '**/.{idea,git,cache,output,temp}/**'
        ],

        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/test-*.ts',
                'src/test-setup.ts'
            ]
        },

        // Timeout for unit tests (shorter than integration tests)
        testTimeout: 5000,
        hookTimeout: 5000,

        // Reporter
        reporter: 'default'
    }
});
