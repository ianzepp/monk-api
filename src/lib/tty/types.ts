/**
 * TTY Types
 *
 * Core interfaces for the TTY server implementation.
 * Transport-agnostic types that work with Telnet, SSH, and future SFTP.
 */

import type { SystemInit } from '@src/lib/system.js';

/**
 * Stream interface for reading/writing to a TTY connection.
 * Implemented by Telnet and SSH transports.
 */
export interface TTYStream {
    /** Write data to the client */
    write(data: string | Uint8Array): void;

    /** Close the connection */
    end(): void;

    /** Check if stream is still open */
    readonly isOpen: boolean;
}

/**
 * Session state machine states
 */
export type SessionState =
    | 'AWAITING_USERNAME'
    | 'AWAITING_PASSWORD'
    | 'AUTHENTICATED'
    | 'REGISTER_TENANT'
    | 'REGISTER_USERNAME'
    | 'REGISTER_PASSWORD'
    | 'REGISTER_CONFIRM';

/**
 * Registration data collected during registration flow
 */
export interface RegistrationData {
    tenant: string;
    username: string;
    password: string;
}

/**
 * User session context (transport-agnostic)
 */
export interface Session {
    /** Unique session identifier */
    id: string;

    /** Current authentication state */
    state: SessionState;

    /** Authenticated username */
    username: string;

    /** Tenant name */
    tenant: string;

    /** Current working directory in the virtual filesystem */
    cwd: string;

    /** Environment variables */
    env: Record<string, string>;

    /** Input buffer for line accumulation */
    inputBuffer: string;

    /** SystemInit from JWT payload (set after authentication) */
    systemInit: SystemInit | null;

    /** Cleanup handlers for subscriptions (future: watch, tail -f) */
    cleanupHandlers: (() => void)[];

    /** Flag to signal connection should close (set by exit command) */
    shouldClose: boolean;

    /** Registration data (populated during registration flow) */
    registrationData: RegistrationData | null;
}

/**
 * Parsed command with arguments and redirects
 */
export interface ParsedCommand {
    /** Command name */
    command: string;

    /** Command arguments */
    args: string[];

    /** Input redirect file (< file) */
    inputRedirect?: string;

    /** Output redirect file (> file) */
    outputRedirect?: string;

    /** Append redirect file (>> file) */
    appendRedirect?: string;

    /** Piped command (cmd1 | cmd2) */
    pipe?: ParsedCommand;
}

/**
 * TTY server configuration
 */
export interface TTYConfig {
    /** Message of the day (welcome banner) */
    motd?: string;

    /** Telnet port (default: 2323) */
    telnetPort?: number;

    /** Telnet bind host (default: 0.0.0.0) */
    telnetHost?: string;

    /** SSH port (default: 2222) */
    sshPort?: number;

    /** SSH bind host (default: 0.0.0.0) */
    sshHost?: string;

    /** Path to SSH host key file */
    sshHostKey?: string;
}

/**
 * Write function type for command output
 */
export type WriteFunction = (text: string) => void;

/**
 * Create a new session with default values
 */
export function createSession(id: string): Session {
    return {
        id,
        state: 'AWAITING_USERNAME',
        username: '',
        tenant: '',
        cwd: '/',
        inputBuffer: '',
        env: {
            TERM: 'xterm',
            SHELL: '/bin/monksh',
        },
        systemInit: null,
        cleanupHandlers: [],
        shouldClose: false,
        registrationData: null,
    };
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Default message of the day
 */
export const DEFAULT_MOTD = `
╔══════════════════════════════════════════════════╗
║           Welcome to Monk TTY v5.1.0             ║
║        Navigate your data like a filesystem      ║
╚══════════════════════════════════════════════════╝
`;
