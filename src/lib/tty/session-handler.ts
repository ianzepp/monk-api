/**
 * Session Handler
 *
 * Manages TTY session lifecycle:
 * - Authentication state machine
 * - Command parsing and dispatch
 * - FS transaction management
 */

import type { Session, TTYStream, TTYConfig, ParsedCommand, CommandIO } from './types.js';
import { DEFAULT_MOTD } from './types.js';
import { parseCommand, expandVariables } from './parser.js';
import { commands } from './commands.js';
import { login, register } from '@src/lib/auth.js';
import { runTransaction } from '@src/lib/transaction.js';
import { PassThrough } from 'node:stream';
import type { FS } from '@src/lib/fs/index.js';

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
 * Complete login and transition to AUTHENTICATED state
 */
async function completeLogin(
    stream: TTYStream,
    session: Session,
    systemInit: import('@src/lib/system.js').SystemInit,
    user: { username: string; tenant: string; access: string }
): Promise<void> {
    session.systemInit = systemInit;
    session.state = 'AUTHENTICATED';
    session.username = user.username;
    session.tenant = user.tenant;

    session.env['USER'] = user.username;
    session.env['TENANT'] = user.tenant;
    session.env['ACCESS'] = user.access;

    await loadHistory(session);

    writeToStream(stream, `\nWelcome ${session.username}@${session.tenant}!\n`);
    writeToStream(stream, `Access level: ${user.access}\n\n`);
    printPrompt(stream, session);
}

/**
 * Load command history from ~/.history
 */
async function loadHistory(session: Session): Promise<void> {
    if (!session.systemInit) return;

    try {
        const { runTransaction } = await import('@src/lib/transaction.js');
        await runTransaction(session.systemInit, async (system) => {
            const historyPath = `/home/${session.username}/.history`;

            try {
                const content = await system.fs.read(historyPath);
                session.history = content.toString().split('\n').filter(Boolean);
            } catch {
                // No history file yet, that's fine
                session.history = [];
            }
        });
    } catch {
        session.history = [];
    }
}

/**
 * Save command history to ~/.history
 */
export async function saveHistory(session: Session): Promise<void> {
    if (!session.systemInit || session.history.length === 0) return;

    try {
        const { runTransaction } = await import('@src/lib/transaction.js');
        await runTransaction(session.systemInit, async (system) => {
            const historyPath = `/home/${session.username}/.history`;

            // Ensure home directory exists
            const homePath = `/home/${session.username}`;
            if (!await system.fs.exists(homePath)) {
                await system.fs.mkdir(homePath);
            }

            // Keep last 1000 commands
            const trimmed = session.history.slice(-1000);
            await system.fs.write(historyPath, trimmed.join('\n') + '\n');
        });
    } catch {
        // Ignore save errors
    }
}

/**
 * Clear current line and write new content
 */
function replaceLine(stream: TTYStream, session: Session, newContent: string): void {
    // Move cursor to start of input, clear to end of line
    const clearLen = session.inputBuffer.length;
    if (clearLen > 0) {
        writeToStream(stream, '\x1b[' + clearLen + 'D'); // Move left
        writeToStream(stream, '\x1b[K'); // Clear to end of line
    }
    session.inputBuffer = newContent;
    writeToStream(stream, newContent);
}

/**
 * Handle up arrow - navigate to previous command in history
 */
function handleHistoryUp(stream: TTYStream, session: Session): void {
    if (session.history.length === 0) return;

    // Save current input if just starting to navigate
    if (session.historyIndex === -1) {
        session.historyBuffer = session.inputBuffer;
        session.historyIndex = session.history.length;
    }

    // Move up in history
    if (session.historyIndex > 0) {
        session.historyIndex--;
        replaceLine(stream, session, session.history[session.historyIndex]);
    }
}

/**
 * Handle down arrow - navigate to next command in history
 */
function handleHistoryDown(stream: TTYStream, session: Session): void {
    if (session.historyIndex === -1) return;

    session.historyIndex++;

    if (session.historyIndex >= session.history.length) {
        // Back to current input
        session.historyIndex = -1;
        replaceLine(stream, session, session.historyBuffer);
        session.historyBuffer = '';
    } else {
        replaceLine(stream, session, session.history[session.historyIndex]);
    }
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

    let inEscape = false;
    let escapeBuffer = '';

    for (const char of text) {
        // Handle ANSI escape sequences (e.g., arrow keys: ESC [ A)
        if (char === '\x1b') {
            inEscape = true;
            escapeBuffer = '';
            continue;
        }

        if (inEscape) {
            escapeBuffer += char;
            // CSI sequences end with a letter (A-Z, a-z)
            if (escapeBuffer.length >= 2 && /[A-Za-z~]/.test(char)) {
                inEscape = false;

                // Handle arrow keys for history (only in AUTHENTICATED state)
                if (session.state === 'AUTHENTICATED' && escapeBuffer === '[A') {
                    // Up arrow - previous command
                    handleHistoryUp(stream, session);
                } else if (session.state === 'AUTHENTICATED' && escapeBuffer === '[B') {
                    // Down arrow - next command
                    handleHistoryDown(stream, session);
                }
            }
            continue;
        }

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
                await completeLogin(stream, session, passwordlessResult.systemInit, passwordlessResult.user);
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

            await completeLogin(stream, session, result.systemInit, result.user);
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
    session.registrationData = null;
    await completeLogin(stream, session, loginResult.systemInit, loginResult.user);
}

/**
 * Create a CommandIO with fresh PassThrough streams
 */
function createIO(): CommandIO {
    return {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
    };
}

/**
 * Collect all data from a stream into a string
 */
async function collectStream(stream: PassThrough): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString();
}

/**
 * Build the pipeline chain from parsed commands
 */
function buildPipeline(parsed: ParsedCommand, env: Record<string, string>): ParsedCommand[] {
    const pipeline: ParsedCommand[] = [];
    let current: ParsedCommand | undefined = parsed;

    while (current) {
        // Expand variables in args
        current.args = current.args.map(arg => expandVariables(arg, env));
        pipeline.push(current);
        current = current.pipe;
    }

    return pipeline;
}

/**
 * Check if any command in the pipeline needs a transaction
 */
function pipelineNeedsTransaction(pipeline: ParsedCommand[]): boolean {
    const noTransactionCommands = ['echo', 'env', 'export', 'clear', 'help', 'pwd', 'whoami', 'exit', 'logout', 'quit'];
    return pipeline.some(cmd => !noTransactionCommands.includes(cmd.command));
}

/**
 * Execute a pipeline of commands with proper stream handling
 */
async function executePipeline(
    stream: TTYStream,
    session: Session,
    pipeline: ParsedCommand[],
    fs: FS | null
): Promise<number> {
    if (pipeline.length === 0) return 0;

    // Single command - simple case
    if (pipeline.length === 1) {
        const cmd = pipeline[0];
        const handler = commands[cmd.command];
        if (!handler) {
            writeToStream(stream, `${cmd.command}: command not found\n`);
            return 127;
        }

        const io = createIO();

        // Pipe stdout/stderr to the TTY stream
        io.stdout.on('data', (chunk) => writeToStream(stream, chunk.toString()));
        io.stderr.on('data', (chunk) => writeToStream(stream, chunk.toString()));

        // Close stdin immediately (no input for first command without redirect)
        io.stdin.end();

        try {
            return await handler(session, fs, cmd.args, io);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            writeToStream(stream, `Error: ${message}\n`);
            return 1;
        }
    }

    // Multiple commands - pipe them together
    let lastExitCode = 0;
    let previousOutput = '';

    for (let i = 0; i < pipeline.length; i++) {
        const cmd = pipeline[i];
        const handler = commands[cmd.command];

        if (!handler) {
            writeToStream(stream, `${cmd.command}: command not found\n`);
            return 127;
        }

        const io = createIO();
        const isLast = i === pipeline.length - 1;

        // Feed previous command's output as stdin
        if (previousOutput) {
            io.stdin.end(previousOutput);
        } else {
            io.stdin.end();
        }

        // For last command, pipe to TTY; otherwise collect output
        if (isLast) {
            io.stdout.on('data', (chunk) => writeToStream(stream, chunk.toString()));
            io.stderr.on('data', (chunk) => writeToStream(stream, chunk.toString()));

            try {
                lastExitCode = await handler(session, fs, cmd.args, io);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                writeToStream(stream, `Error: ${message}\n`);
                lastExitCode = 1;
            }
        } else {
            // Collect stderr to TTY, stdout to buffer
            io.stderr.on('data', (chunk) => writeToStream(stream, chunk.toString()));

            try {
                const [exitCode, output] = await Promise.all([
                    handler(session, fs, cmd.args, io),
                    collectStream(io.stdout),
                ]);
                lastExitCode = exitCode;
                previousOutput = output;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                writeToStream(stream, `Error: ${message}\n`);
                return 1;
            }
        }
    }

    return lastExitCode;
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

    // Build pipeline and expand variables
    const pipeline = buildPipeline(parsed, session.env);

    // Add to history (avoid duplicates of last command)
    if (session.history[session.history.length - 1] !== input) {
        session.history.push(input);
    }

    // Reset history navigation
    session.historyIndex = -1;
    session.historyBuffer = '';

    // Check if pipeline needs a transaction
    if (!pipelineNeedsTransaction(pipeline)) {
        // Run without FS
        await executePipeline(stream, session, pipeline, null);
        return;
    }

    // Commands that need a transaction and FS
    if (!session.systemInit) {
        writeToStream(stream, 'Error: Not authenticated\n');
        return;
    }

    try {
        await runTransaction(session.systemInit, async (system) => {
            await executePipeline(stream, session, pipeline, system.fs);
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeToStream(stream, `Error: ${message}\n`);
    }
}
