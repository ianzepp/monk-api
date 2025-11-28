/**
 * TTY Module
 *
 * Telnet and SSH server for shell access to Monk API.
 * Provides filesystem-like navigation over database models.
 */

import type { TTYConfig } from './types.js';
import { createTelnetServer } from './telnet-server.js';
import { createSSHServer } from './ssh-server.js';

// Types
export type {
    TTYStream,
    Session,
    SessionState,
    ParsedCommand,
    TTYConfig,
    WriteFunction,
} from './types.js';

export {
    createSession,
    generateSessionId,
    DEFAULT_MOTD,
} from './types.js';

// Parser
export { parseCommand, resolvePath } from './parser.js';

// Commands
export { commands } from './commands.js';
export type { CommandHandler } from './commands.js';

// FS Factory
export { createFS } from './fs-factory.js';

// Session Handler
export {
    handleInput,
    writeToStream,
    printPrompt,
    sendWelcome,
} from './session-handler.js';

// Servers
export { createTelnetServer } from './telnet-server.js';
export { createSSHServer } from './ssh-server.js';

/**
 * Create both Telnet and SSH servers with shared configuration
 *
 * @param config - Server configuration
 * @returns Object with stop() method to shut down both servers
 */
export function createTTYServers(config?: TTYConfig): { stop: () => void } {
    const telnet = createTelnetServer(config);
    const ssh = createSSHServer(config);

    return {
        stop: () => {
            telnet.stop();
            ssh.stop();
        },
    };
}
