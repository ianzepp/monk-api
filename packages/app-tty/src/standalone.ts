#!/usr/bin/env bun
/**
 * Standalone TTY Server Runner
 *
 * Usage:
 *   bun run packages/app-tty/src/standalone.ts
 *
 * Or with options:
 *   TTY_PORT=2323 TTY_API_URL=http://localhost:3000 bun run packages/app-tty/src/standalone.ts
 */

import { createTTYServer } from './server.js';

const config = {
    port: parseInt(process.env['TTY_PORT'] || '2323', 10),
    host: process.env['TTY_HOST'] || '0.0.0.0',
    apiBaseUrl: process.env['TTY_API_URL'] || 'http://localhost:9001',
    motd: process.env['TTY_MOTD']
};

console.log('Starting Monk TTY Server...');
console.log(`  API URL: ${config.apiBaseUrl}`);
console.log(`  Listen:  ${config.host}:${config.port}`);
console.log('');
console.log('Connect with: telnet localhost ' + config.port);
console.log('');

createTTYServer(config);
