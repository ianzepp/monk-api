#!/usr/bin/env bun
/**
 * Standalone TTY Server Runner
 *
 * Starts both telnet and SSH servers.
 *
 * Usage:
 *   bun run packages/app-tty/src/standalone.ts
 *
 * Environment variables:
 *   TTY_API_URL     - Monk API URL (default: http://localhost:9001)
 *   TTY_TELNET_PORT - Telnet port (default: 2323)
 *   TTY_SSH_PORT    - SSH port (default: 2222)
 *   TTY_HOST        - Bind host (default: 0.0.0.0)
 *   TTY_SSH_KEY     - Path to SSH host key (auto-generated if missing)
 *   TTY_MOTD        - Custom message of the day
 */

import type { TTYConfig } from './transport.js';
import { createTelnetServer } from './telnet-server.js';
import { createSSHServer } from './ssh-server.js';

const config: TTYConfig = {
    apiBaseUrl: process.env['TTY_API_URL'] || 'http://localhost:9001',
    telnetPort: parseInt(process.env['TTY_TELNET_PORT'] || '2323', 10),
    telnetHost: process.env['TTY_HOST'] || '0.0.0.0',
    sshPort: parseInt(process.env['TTY_SSH_PORT'] || '2222', 10),
    sshHost: process.env['TTY_HOST'] || '0.0.0.0',
    sshHostKey: process.env['TTY_SSH_KEY'],
    motd: process.env['TTY_MOTD']
};

console.log('Starting Monk TTY Servers...');
console.log(`  API URL: ${config.apiBaseUrl}`);
console.log('');

// Start telnet server
createTelnetServer(config);
console.log(`  Connect: telnet localhost ${config.telnetPort}`);

// Start SSH server
createSSHServer(config);
console.log(`  Connect: ssh user@localhost -p ${config.sshPort}`);

console.log('');
console.log('Login format: user@tenant (e.g., demo@tty_demo2)');
