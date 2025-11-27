/**
 * TTY Session Types
 */

import type { Socket } from 'bun';

/**
 * Session state machine
 */
export type SessionState = 'AWAITING_USERNAME' | 'AWAITING_PASSWORD' | 'AUTHENTICATED';

/**
 * User session context
 */
export interface Session {
    id: string;
    socket: Socket<SessionData>;
    state: SessionState;
    username: string;
    tenant: string;
    token: string;
    cwd: string;  // Current working directory (model path)
    env: Record<string, string>;  // Environment variables
}

/**
 * Socket data attached to each connection
 */
export interface SessionData {
    session: Session;
    inputBuffer: string;
}

/**
 * Command handler function signature
 */
export type CommandHandler = (
    session: Session,
    args: string[],
    write: (text: string) => void
) => Promise<void>;

/**
 * Parsed command with arguments and redirects
 */
export interface ParsedCommand {
    command: string;
    args: string[];
    inputRedirect?: string;   // < file
    outputRedirect?: string;  // > file
    appendRedirect?: string;  // >> file
    pipe?: ParsedCommand;     // | next_command
}

/**
 * Virtual filesystem entry
 */
export interface FSEntry {
    name: string;
    type: 'model' | 'record';
    path: string;
}

/**
 * TTY server configuration
 */
export interface TTYConfig {
    port: number;
    host: string;
    apiBaseUrl: string;
    motd?: string;  // Message of the day
}
