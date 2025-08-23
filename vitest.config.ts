import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        testTimeout: 30000,
        setupFiles: ['./src/test-setup.ts'],
    },
    resolve: {
        alias: {
            '@src': resolve(__dirname, 'src'),
            '@lib': resolve(__dirname, 'src/lib'),
            '@observers': resolve(__dirname, 'src/lib/observers'),
            '@routes': resolve(__dirname, 'src/routes'),
            '@test': resolve(__dirname, 'spec'),
        },
    },
});