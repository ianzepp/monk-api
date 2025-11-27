/**
 * Transport Abstraction
 *
 * Common interface for TTY transports (telnet, SSH).
 * Allows the session handler to be transport-agnostic.
 */

/**
 * Stream interface for reading/writing to a TTY connection
 */
export interface TTYStream {
    /** Write text to the client */
    write(data: string | Uint8Array): void;

    /** Close the connection */
    end(): void;

    /** Check if stream is still open */
    readonly isOpen: boolean;
}

/**
 * Session state machine
 */
export type SessionState = 'AWAITING_USERNAME' | 'AWAITING_PASSWORD' | 'AUTHENTICATED';

/**
 * User session context (transport-agnostic)
 */
export interface Session {
    id: string;
    state: SessionState;
    username: string;
    tenant: string;
    token: string;
    cwd: string;
    env: Record<string, string>;
    inputBuffer: string;
}

/**
 * Create a new session with default values
 */
export function createSession(id: string, apiUrl: string): Session {
    return {
        id,
        state: 'AWAITING_USERNAME',
        username: '',
        tenant: '',
        token: '',
        cwd: '/',
        inputBuffer: '',
        env: {
            API_URL: apiUrl,
            TERM: 'xterm',
            SHELL: '/bin/monksh'
        }
    };
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Parsed command with arguments and redirects
 */
export interface ParsedCommand {
    command: string;
    args: string[];
    inputRedirect?: string;
    outputRedirect?: string;
    appendRedirect?: string;
    pipe?: ParsedCommand;
}

/**
 * TTY server configuration
 */
export interface TTYConfig {
    apiBaseUrl: string;
    motd?: string;

    // Telnet settings
    telnetPort?: number;
    telnetHost?: string;

    // SSH settings
    sshPort?: number;
    sshHost?: string;
    sshHostKey?: string;
}

/**
 * Default MOTD
 */
export const DEFAULT_MOTD = `
╔══════════════════════════════════════════════════╗
║           Welcome to Monk TTY v5.1.0             ║
║        Navigate your data like a filesystem      ║
╚══════════════════════════════════════════════════╝
`;
