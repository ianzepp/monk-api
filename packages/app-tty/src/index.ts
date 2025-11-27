/**
 * @monk/app-tty - Telnet & SSH Interface
 *
 * Navigate your Monk API data like a Unix filesystem.
 *
 * Usage:
 *   import { createTelnetServer, createSSHServer } from '@monk/app-tty';
 *
 *   // Start both servers
 *   createTelnetServer({ apiBaseUrl: 'http://localhost:9001', telnetPort: 2323 });
 *   createSSHServer({ apiBaseUrl: 'http://localhost:9001', sshPort: 2222 });
 *
 * Connect:
 *   telnet localhost 2323
 *   ssh user@tenant@localhost -p 2222
 *
 * Commands:
 *   ls, cd, pwd, cat, rm, touch, find, grep, head, wc
 *   whoami, env, export, clear, help, exit
 */

// Transport abstraction
export type {
    TTYStream,
    Session,
    SessionState,
    TTYConfig
} from './transport.js';

export {
    createSession,
    generateSessionId,
    DEFAULT_MOTD
} from './transport.js';

// Servers
export { createTelnetServer } from './telnet-server.js';
export { createSSHServer } from './ssh-server.js';

// Session handling
export {
    handleInput,
    writeToStream,
    sendWelcome,
    printPrompt
} from './session-handler.js';

// Commands
export { commands } from './commands.js';
export type { CommandHandler } from './commands.js';

// Utilities
export { parseCommand, resolvePath } from './parser.js';
export { ApiClient, setHonoApp } from './api-client.js';

// Backward compatibility - alias createTelnetServer as createTTYServer
export { createTelnetServer as createTTYServer } from './telnet-server.js';
