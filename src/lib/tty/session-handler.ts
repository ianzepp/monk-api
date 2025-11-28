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
import { login, register } from '@src/lib/auth.js';
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
            const passwordStates = ['AWAITING_PASSWORD', 'REGISTER_PASSWORD', 'REGISTER_CONFIRM'];
            if (passwordStates.includes(session.state)) {
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

            // Check for 'register' command
            if (trimmed.toLowerCase() === 'register') {
                writeToStream(stream, '\n=== New Tenant Registration ===\n');
                writeToStream(stream, 'Tenant name: ');
                session.state = 'REGISTER_TENANT';
                session.registrationData = { tenant: '', username: '', password: '' };
                return;
            }

            // Parse user@tenant format
            const atIndex = trimmed.indexOf('@');
            if (atIndex === -1) {
                writeToStream(stream, 'Invalid format. Use: username@tenant (or type "register" to create a new tenant)\n');
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

            // Try passwordless login first
            const passwordlessResult = await login({
                tenant: session.tenant,
                username: session.username,
            });

            if (passwordlessResult.success) {
                // Passwordless login succeeded
                session.systemInit = passwordlessResult.systemInit;
                session.state = 'AUTHENTICATED';
                session.env['USER'] = passwordlessResult.user.username;
                session.env['TENANT'] = passwordlessResult.user.tenant;
                session.env['ACCESS'] = passwordlessResult.user.access;

                writeToStream(stream, `\nWelcome ${session.username}@${session.tenant}!\n`);
                writeToStream(stream, `Access level: ${passwordlessResult.user.access}\n\n`);
                printPrompt(stream, session);
                return;
            }

            // If password is required, prompt for it
            if (passwordlessResult.errorCode === 'AUTH_PASSWORD_REQUIRED') {
                session.state = 'AWAITING_PASSWORD';
                writeToStream(stream, 'Password: ');
                return;
            }

            // Other error (user not found, tenant not found, etc.)
            writeToStream(stream, `\nLogin failed: ${passwordlessResult.error}\n`);
            session.state = 'AWAITING_USERNAME';
            session.username = '';
            session.tenant = '';
            writeToStream(stream, 'monk login: ');
            break;
        }

        case 'AWAITING_PASSWORD': {
            // Attempt login with password
            const result = await login({
                tenant: session.tenant,
                username: session.username,
                password: trimmed,
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

            // Check if exit command requested connection close
            if (session.shouldClose) {
                stream.end();
                return;
            }

            printPrompt(stream, session);
            break;
        }

        case 'REGISTER_TENANT': {
            if (!trimmed) {
                writeToStream(stream, 'Tenant name: ');
                return;
            }

            // Validate tenant name (lowercase alphanumeric and underscores only)
            if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
                writeToStream(stream, 'Invalid tenant name. Must be lowercase, start with a letter, and contain only letters, numbers, and underscores.\n');
                writeToStream(stream, 'Tenant name: ');
                return;
            }

            session.registrationData!.tenant = trimmed;
            session.state = 'REGISTER_USERNAME';
            writeToStream(stream, 'Username (default: root): ');
            break;
        }

        case 'REGISTER_USERNAME': {
            // Default to 'root' if empty
            const username = trimmed || 'root';

            // Validate username
            if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(username)) {
                writeToStream(stream, 'Invalid username. Must start with a letter and contain only letters, numbers, underscores, and hyphens.\n');
                writeToStream(stream, 'Username (default: root): ');
                return;
            }

            session.registrationData!.username = username;
            session.state = 'REGISTER_PASSWORD';
            writeToStream(stream, 'Password (optional): ');
            break;
        }

        case 'REGISTER_PASSWORD': {
            session.registrationData!.password = trimmed;

            if (trimmed) {
                session.state = 'REGISTER_CONFIRM';
                writeToStream(stream, 'Confirm password: ');
            } else {
                // No password - proceed to registration
                await completeRegistration(stream, session, config);
            }
            break;
        }

        case 'REGISTER_CONFIRM': {
            if (trimmed !== session.registrationData!.password) {
                writeToStream(stream, 'Passwords do not match. Try again.\n');
                session.registrationData!.password = '';
                session.state = 'REGISTER_PASSWORD';
                writeToStream(stream, 'Password (optional): ');
                return;
            }

            await completeRegistration(stream, session, config);
            break;
        }
    }
}

/**
 * Complete the registration process and auto-login
 */
async function completeRegistration(
    stream: TTYStream,
    session: Session,
    config?: TTYConfig
): Promise<void> {
    const { tenant, username, password } = session.registrationData!;

    writeToStream(stream, '\nCreating tenant...\n');

    const result = await register({
        tenant,
        username,
        password: password || undefined,
    });

    if (!result.success) {
        writeToStream(stream, `\nRegistration failed: ${result.error}\n\n`);
        session.state = 'AWAITING_USERNAME';
        session.registrationData = null;
        writeToStream(stream, 'monk login: ');
        return;
    }

    writeToStream(stream, `\nTenant '${result.tenant}' created successfully!\n`);

    // Auto-login after registration
    const loginResult = await login({
        tenant: result.tenant,
        username: result.username,
        password: password || undefined,
    });

    if (!loginResult.success) {
        // Shouldn't happen, but handle gracefully
        writeToStream(stream, `You can now login as ${result.username}@${result.tenant}\n\n`);
        session.state = 'AWAITING_USERNAME';
        session.registrationData = null;
        writeToStream(stream, 'monk login: ');
        return;
    }

    // Set up authenticated session
    session.username = result.username;
    session.tenant = result.tenant;
    session.systemInit = loginResult.systemInit;
    session.state = 'AUTHENTICATED';
    session.registrationData = null;

    session.env['USER'] = loginResult.user.username;
    session.env['TENANT'] = loginResult.user.tenant;
    session.env['ACCESS'] = loginResult.user.access;

    writeToStream(stream, `\nWelcome ${session.username}@${session.tenant}!\n`);
    writeToStream(stream, `Access level: ${loginResult.user.access}\n\n`);
    printPrompt(stream, session);
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
    const noTransactionCommands = ['echo', 'env', 'export', 'clear', 'help', 'pwd', 'whoami', 'exit', 'logout', 'quit'];

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
