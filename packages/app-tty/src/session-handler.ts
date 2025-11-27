/**
 * Session Handler
 *
 * Transport-agnostic session management.
 * Handles input processing, authentication, and command execution.
 */

import type { TTYStream, Session, TTYConfig } from './transport.js';
import { parseCommand, resolvePath } from './parser.js';
import { commands } from './commands.js';
import { ApiClient } from './api-client.js';
import { DEFAULT_MOTD } from './transport.js';

/**
 * Write to stream with CRLF line endings (for terminal compatibility)
 */
export function writeToStream(stream: TTYStream, text: string): void {
    const formatted = text.replace(/\r?\n/g, '\r\n');
    stream.write(formatted);
}

/**
 * Print shell prompt
 */
export function printPrompt(stream: TTYStream, session: Session): void {
    const shortCwd = session.cwd === '/' ? '/' : session.cwd.split('/').pop();
    writeToStream(stream, `monk:${shortCwd}$ `);
}

/**
 * Send welcome message
 */
export function sendWelcome(stream: TTYStream, config: TTYConfig): void {
    writeToStream(stream, config.motd || DEFAULT_MOTD);
    writeToStream(stream, '\nmonk login: ');
}

/**
 * Process input data from any transport
 */
export async function handleInput(
    stream: TTYStream,
    session: Session,
    data: string,
    config: TTYConfig,
    echo: boolean = true
): Promise<void> {
    // Buffer input until newline
    session.inputBuffer += data;

    // Echo input (except password)
    if (echo) {
        if (session.state !== 'AWAITING_PASSWORD') {
            // Handle backspace
            if (data === '\x7f' || data === '\b') {
                if (session.inputBuffer.length > 0) {
                    session.inputBuffer = session.inputBuffer.slice(0, -2);
                    writeToStream(stream, '\b \b');
                }
                return;
            }
            // Echo but skip \r
            const echoText = data.replace(/\r/g, '');
            if (echoText) {
                writeToStream(stream, echoText);
            }
        } else {
            // Mask password
            if (data === '\x7f' || data === '\b') {
                session.inputBuffer = session.inputBuffer.slice(0, -2);
                writeToStream(stream, '\b \b');
                return;
            }
            // Count printable chars for masking
            const printable = data.replace(/[\r\n]/g, '');
            if (printable.length > 0) {
                writeToStream(stream, '*'.repeat(printable.length));
            }
        }
    }

    // Process complete lines
    if (!session.inputBuffer.includes('\n') && !session.inputBuffer.includes('\r')) {
        return;
    }

    const lines = session.inputBuffer.split(/[\r\n]+/);
    session.inputBuffer = lines.pop() || '';

    for (const line of lines) {
        const trimmed = line.trim();

        // Allow empty input for password prompt, skip otherwise
        if (!trimmed && session.state !== 'AWAITING_PASSWORD') {
            continue;
        }

        // Ensure we're on a new line before processing
        writeToStream(stream, '\n');
        await processLine(stream, session, trimmed, config);
    }
}

/**
 * Process a complete input line
 */
async function processLine(
    stream: TTYStream,
    session: Session,
    line: string,
    config: TTYConfig
): Promise<void> {
    switch (session.state) {
        case 'AWAITING_USERNAME': {
            // Format: user@tenant or just user (uses default tenant)
            const [userPart, tenantPart] = line.split('@');
            session.username = userPart;
            session.tenant = tenantPart || session.env['DEFAULT_TENANT'] || '';

            if (!session.tenant) {
                writeToStream(stream, 'Tenant: ');
                session.state = 'AWAITING_PASSWORD';
                session.env['_awaiting'] = 'tenant';
                return;
            }

            session.state = 'AWAITING_PASSWORD';
            writeToStream(stream, 'Password: ');
            return;
        }

        case 'AWAITING_PASSWORD': {
            // Check if we're actually awaiting tenant
            if (session.env['_awaiting'] === 'tenant') {
                session.tenant = line;
                delete session.env['_awaiting'];
                writeToStream(stream, '\nPassword: ');
                return;
            }

            // Attempt login
            try {
                const api = new ApiClient(config.apiBaseUrl, session);
                const password = line || undefined;
                const result = await api.login(session.tenant, session.username, password as string);

                if (result.success && result.data?.token) {
                    session.token = result.data.token;
                    session.state = 'AUTHENTICATED';
                    writeToStream(stream, '\n\n');
                    writeToStream(stream, `Welcome ${session.username}@${session.tenant}\n`);
                    writeToStream(stream, `Type 'help' for available commands.\n\n`);
                    printPrompt(stream, session);
                } else {
                    writeToStream(stream, '\nLogin incorrect\n\n');
                    session.state = 'AWAITING_USERNAME';
                    session.username = '';
                    session.tenant = '';
                    writeToStream(stream, 'monk login: ');
                }
            } catch (err) {
                console.error('TTY login error:', err);
                writeToStream(stream, '\nLogin error: ' + (err instanceof Error ? err.message : 'Unknown error') + '\n\n');
                session.state = 'AWAITING_USERNAME';
                session.username = '';
                session.tenant = '';
                writeToStream(stream, 'monk login: ');
            }
            return;
        }

        case 'AUTHENTICATED': {
            await executeCommand(stream, session, line);
            if (session.state === 'AUTHENTICATED') {
                printPrompt(stream, session);
            } else {
                // Logged out
                writeToStream(stream, '\nmonk login: ');
            }
            return;
        }
    }
}

/**
 * Execute a shell command
 */
async function executeCommand(stream: TTYStream, session: Session, line: string): Promise<void> {
    const parsed = parseCommand(line);

    if (!parsed) return;

    const handler = commands[parsed.command];
    if (!handler) {
        writeToStream(stream, `${parsed.command}: command not found\n`);
        return;
    }

    // Handle output redirect
    let output = '';
    const writeFunc = parsed.outputRedirect || parsed.appendRedirect
        ? (text: string) => { output += text; }
        : (text: string) => writeToStream(stream, text);

    try {
        await handler(session, parsed.args, writeFunc);

        // Handle redirect to file (create record)
        if (parsed.outputRedirect) {
            await handleOutputRedirect(stream, session, parsed.outputRedirect, output);
        }
    } catch (error) {
        writeToStream(stream, `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }
}

/**
 * Handle output redirect (> file)
 */
async function handleOutputRedirect(
    stream: TTYStream,
    session: Session,
    target: string,
    output: string
): Promise<void> {
    const resolvedPath = target === '.'
        ? session.cwd
        : resolvePath(session.cwd, target);

    const parts = resolvedPath.split('/').filter(Boolean);
    if (parts.length === 0) {
        writeToStream(stream, 'Cannot redirect to root\n');
        return;
    }

    const model = parts[0];

    try {
        const data = JSON.parse(output.trim());
        const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);
        const result = await api.createRecord(model, data);

        if (result.success) {
            const id = result.data?.id || result.data?._id;
            writeToStream(stream, `Created: /${model}/${id}.json\n`);
        } else {
            writeToStream(stream, `Error: ${result.error}\n`);
        }
    } catch {
        writeToStream(stream, 'Error: Invalid JSON for redirect\n');
    }
}
