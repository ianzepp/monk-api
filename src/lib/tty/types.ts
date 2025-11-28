/**
 * TTY Types
 *
 * Core interfaces for the TTY server implementation.
 * Transport-agnostic types that work with Telnet, SSH, and future SFTP.
 */

import type { SystemInit } from '@src/lib/system.js';
import type { PassThrough } from 'node:stream';

/**
 * Stream interface for reading/writing to a TTY connection.
 * Designed to be compatible with Node.js TTY interfaces for TUI library support.
 *
 * Implemented by Telnet and SSH transports.
 */
export interface TTYStream {
    /** Write data to the client */
    write(data: string | Uint8Array): void;

    /** Close the connection */
    end(): void;

    /** Check if stream is still open */
    readonly isOpen: boolean;

    // Node.js TTY WriteStream compatibility

    /** Always true - identifies this as a TTY stream */
    readonly isTTY: true;

    /** Terminal width in columns (default: 80) */
    columns: number;

    /** Terminal height in rows (default: 24) */
    rows: number;

    // Input stream for TUI libraries

    /**
     * Readable stream for input data.
     * TUI libraries (blessed, ink) listen to 'data' and 'keypress' events on this.
     * Transport implementations push received data into this stream.
     */
    readonly input: PassThrough;

    // Event handling for resize

    /** Register a resize callback */
    onResize(callback: (cols: number, rows: number) => void): void;

    /** Remove a resize callback */
    offResize(callback: (cols: number, rows: number) => void): void;
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

    /** Process ID for this shell session */
    pid: number | null;

    /** Current authentication state */
    state: SessionState;

    /** Authenticated username */
    username: string;

    /** Tenant name */
    tenant: string;

    /** Abort controller for current foreground command (null if idle) */
    foregroundAbort: AbortController | null;

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

    /** Command history */
    history: string[];

    /** Current position in history when navigating (-1 = not navigating) */
    historyIndex: number;

    /** Saved input buffer when browsing history */
    historyBuffer: string;

    /** Session-local mounts (re-applied to each transaction's FS) */
    mounts: Map<string, { type: 'local'; path: string; readonly: boolean }>;
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

    /** Run in background (&) */
    background?: boolean;

    /** Next command in && chain (run if this succeeds) */
    andThen?: ParsedCommand;

    /** Next command in || chain (run if this fails) */
    orElse?: ParsedCommand;
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
 * Command I/O streams for pipe support
 *
 * Uses PassThrough streams to enable:
 * - Piping between commands (cmd1 | cmd2)
 * - Input/output redirection (< file, > file)
 * - Proper backpressure handling
 */
export interface CommandIO {
    /** Standard input stream */
    stdin: PassThrough;

    /** Standard output stream */
    stdout: PassThrough;

    /** Standard error stream */
    stderr: PassThrough;

    /** Abort signal for cancellation (background processes) */
    signal?: AbortSignal;
}

/**
 * Global session registry for cross-session signaling (e.g., kill)
 * Maps PID to Session object. PIDs are globally unique (serial column).
 */
const sessionRegistry = new Map<number, Session>();

/**
 * Register a session in the global registry
 */
export function registerSession(pid: number, session: Session): void {
    sessionRegistry.set(pid, session);
}

/**
 * Unregister a session from the global registry
 */
export function unregisterSession(pid: number): void {
    sessionRegistry.delete(pid);
}

/**
 * Look up a session by PID
 */
export function getSessionByPid(pid: number): Session | undefined {
    return sessionRegistry.get(pid);
}

/**
 * Create a new session with default values
 */
export function createSession(id: string): Session {
    return {
        id,
        pid: null,
        state: 'AWAITING_USERNAME',
        username: '',
        tenant: '',
        foregroundAbort: null,
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
        history: [],
        historyIndex: -1,
        historyBuffer: '',
        mounts: new Map(),
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
 * Loaded from motd.txt at module initialization
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MOTD = (() => {
    try {
        return readFileSync(join(__dirname, 'motd.txt'), 'utf-8');
    } catch {
        return '\nWelcome to Monk TTY\n';
    }
})();
