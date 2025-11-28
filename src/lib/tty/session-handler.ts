/**
 * Session Handler
 *
 * Manages TTY session lifecycle:
 * - Authentication state machine
 * - Command parsing and dispatch
 * - FS transaction management
 */

import type { Session, TTYStream, TTYConfig } from './types.js';
import { DEFAULT_MOTD } from './types.js';
import { parseCommand } from './parser.js';
import { commands } from './commands.js';
import { createFS } from './fs-factory.js';
import { login } from '@src/lib/auth.js';
import { runTransaction } from '@src/lib/transaction.js';

/**
 * Write text to stream with CRLF line endings (telnet convention)
 */
export function writeToStream(stream: TTYStream, text: string): void {
    // Convert LF to CRLF for telnet compatibility
    const normalized = text.replace(/(?<!\r)\n/g, '\r\n');
    stream.write(normalized);
}

/**
 * Print command prompt
 */
export function printPrompt(stream: TTYStream, session: Session): void {
    const prompt = `${session.username}@${session.tenant}:${session.cwd}$ `;
    writeToStream(stream, prompt);
}

/**
 * Send welcome message and login prompt
 */
export function sendWelcome(stream: TTYStream, config?: TTYConfig): void {
    const motd = config?.motd || DEFAULT_MOTD;
    writeToStream(stream, motd);
    writeToStream(stream, '\nmonk login: ');
}

/**
 * Handle input data from the stream.
 * Buffers input until newline, then processes.
 *
 * @param stream - TTY stream for output
 * @param session - Session state
 * @param data - Raw input data
 * @param config - Optional server config
 * @param echo - Whether to echo input (false for password)
 */
export async function handleInput(
    stream: TTYStream,
    session: Session,
    data: string | Uint8Array,
    config?: TTYConfig,
    echo = true
): Promise<void> {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);

    for (const char of text) {
        // Handle backspace
        if (char === '\x7f' || char === '\x08') {
            if (session.inputBuffer.length > 0) {
                session.inputBuffer = session.inputBuffer.slice(0, -1);
                if (echo) {
                    writeToStream(stream, '\b \b');
                }
            }
            continue;
        }

        // Handle newline
        if (char === '\n' || char === '\r') {
            if (echo) {
                writeToStream(stream, '\r\n');
            }
            const line = session.inputBuffer;
            session.inputBuffer = '';
            await processLine(stream, session, line, config);
            continue;
        }

        // Accumulate input
        session.inputBuffer += char;
        if (echo) {
            // Mask password input
            if (session.state === 'AWAITING_PASSWORD') {
                writeToStream(stream, '*');
            } else {
                writeToStream(stream, char);
            }
        }
    }
}

/**
 * Process a complete input line based on session state
 */
async function processLine(
    stream: TTYStream,
    session: Session,
    line: string,
    config?: TTYConfig
): Promise<void> {
    const trimmed = line.trim();

    switch (session.state) {
        case 'AWAITING_USERNAME': {
            if (!trimmed) {
                writeToStream(stream, 'monk login: ');
                return;
            }

            // Parse user@tenant format
            const atIndex = trimmed.indexOf('@');
            if (atIndex === -1) {
                writeToStream(stream, 'Invalid format. Use: username@tenant\n');
                writeToStream(stream, 'monk login: ');
                return;
            }

            session.username = trimmed.slice(0, atIndex);
            session.tenant = trimmed.slice(atIndex + 1);

            if (!session.username || !session.tenant) {
                writeToStream(stream, 'Invalid format. Use: username@tenant\n');
                writeToStream(stream, 'monk login: ');
                return;
            }

            session.state = 'AWAITING_PASSWORD';
            writeToStream(stream, 'Password: ');
            break;
        }

        case 'AWAITING_PASSWORD': {
            // Attempt login
            const result = await login({
                tenant: session.tenant,
                username: session.username,
                password: trimmed || undefined,
            });

            if (!result.success) {
                writeToStream(stream, `\nLogin failed: ${result.error}\n`);
                session.state = 'AWAITING_USERNAME';
                session.username = '';
                session.tenant = '';
                writeToStream(stream, 'monk login: ');
                return;
            }

            // Store systemInit for transactions
            session.systemInit = result.systemInit;
            session.state = 'AUTHENTICATED';

            // Set environment variables
            session.env['USER'] = result.user.username;
            session.env['TENANT'] = result.user.tenant;
            session.env['ACCESS'] = result.user.access;

            writeToStream(stream, `\nWelcome ${session.username}@${session.tenant}!\n`);
            writeToStream(stream, `Access level: ${result.user.access}\n\n`);
            printPrompt(stream, session);
            break;
        }

        case 'AUTHENTICATED': {
            if (!trimmed) {
                printPrompt(stream, session);
                return;
            }

            await executeCommand(stream, session, trimmed);

            // Check if session was reset by exit command
            // Cast needed because TypeScript doesn't track state changes through async calls
            if ((session.state as string) === 'AWAITING_USERNAME') {
                writeToStream(stream, 'Logged out.\n');
                sendWelcome(stream, config);
            } else {
                printPrompt(stream, session);
            }
            break;
        }
    }
}

/**
 * Execute a command within a transaction
 */
async function executeCommand(
    stream: TTYStream,
    session: Session,
    input: string
): Promise<void> {
    const parsed = parseCommand(input);
    if (!parsed) return;

    const handler = commands[parsed.command];
    if (!handler) {
        writeToStream(stream, `${parsed.command}: command not found\n`);
        return;
    }

    // Commands that don't need a transaction
    const noTransactionCommands = ['echo', 'env', 'export', 'clear', 'help', 'pwd', 'whoami'];

    if (noTransactionCommands.includes(parsed.command)) {
        // Run without FS (these commands don't use it)
        try {
            await handler(session, null as any, parsed.args, (text) => writeToStream(stream, text));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            writeToStream(stream, `Error: ${message}\n`);
        }
        return;
    }

    // Commands that need a transaction and FS
    if (!session.systemInit) {
        writeToStream(stream, 'Error: Not authenticated\n');
        return;
    }

    try {
        await runTransaction(session.systemInit, async (system) => {
            const fs = createFS(system);
            await handler(session, fs, parsed.args, (text) => writeToStream(stream, text));
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeToStream(stream, `Error: ${message}\n`);
    }
}
