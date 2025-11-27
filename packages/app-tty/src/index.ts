/**
 * @monk/app-tty - Telnet-style TTY Interface
 *
 * Navigate your Monk API data like a Unix filesystem.
 *
 * Usage:
 *   import { createTTYServer } from '@monk/app-tty';
 *
 *   createTTYServer({
 *       port: 2323,
 *       host: '0.0.0.0',
 *       apiBaseUrl: 'http://localhost:3000'
 *   });
 *
 * Then connect:
 *   telnet localhost 2323
 *
 * Commands:
 *   ls, cd, pwd, cat, rm, touch, find, grep, head, wc
 *   whoami, env, export, clear, help, exit
 */

export { createTTYServer } from './server.js';
export type {
    Session,
    SessionData,
    SessionState,
    TTYConfig,
    CommandHandler,
    ParsedCommand,
    FSEntry
} from './types.js';
export { commands } from './commands.js';
export { parseCommand, resolvePath } from './parser.js';
export { ApiClient, setHonoApp } from './api-client.js';
