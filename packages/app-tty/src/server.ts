/**
 * TTY Server
 *
 * Telnet-style TCP server for Monk API interaction.
 */

import type { Socket } from 'bun';
import type { Session, SessionData, TTYConfig } from './types.js';
import { parseCommand, resolvePath } from './parser.js';
import { commands } from './commands.js';
import { ApiClient } from './api-client.js';

const MOTD_DEFAULT = `
╔══════════════════════════════════════════════════╗
║           Welcome to Monk TTY v5.1.0             ║
║        Navigate your data like a filesystem      ║
╚══════════════════════════════════════════════════╝
`;

/**
 * Telnet negotiation commands
 * These tell the client to let the server handle echoing
 */
const TELNET_IAC = 255;
const TELNET_WILL = 251;
const TELNET_WONT = 252;
const TELNET_DO = 253;
const TELNET_DONT = 254;
const TELNET_ECHO = 1;
const TELNET_SGA = 3;  // Suppress Go-Ahead

// Server will handle echo, client should suppress go-ahead
const TELNET_INIT = new Uint8Array([
    TELNET_IAC, TELNET_WILL, TELNET_ECHO,  // Server will echo
    TELNET_IAC, TELNET_WILL, TELNET_SGA,   // Server will suppress go-ahead
    TELNET_IAC, TELNET_DO, TELNET_SGA,     // Client should suppress go-ahead
]);

/**
 * Filter out telnet IAC command sequences from input
 */
function filterTelnetCommands(data: Uint8Array): Uint8Array {
    const result: number[] = [];
    let i = 0;
    while (i < data.length) {
        if (data[i] === TELNET_IAC) {
            // Skip IAC and the command that follows
            if (i + 1 < data.length) {
                const cmd = data[i + 1];
                if (cmd === TELNET_IAC) {
                    // Escaped 255, keep one
                    result.push(TELNET_IAC);
                    i += 2;
                } else if (cmd === TELNET_WILL || cmd === TELNET_WONT ||
                           cmd === TELNET_DO || cmd === TELNET_DONT) {
                    // 3-byte command, skip all
                    i += 3;
                } else {
                    // 2-byte command, skip
                    i += 2;
                }
            } else {
                i++;
            }
        } else {
            result.push(data[i]);
            i++;
        }
    }
    return new Uint8Array(result);
}

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Create TTY server
 */
export function createTTYServer(config: TTYConfig) {
    const sessions = new Map<string, Session>();

    const server = Bun.listen<SessionData>({
        hostname: config.host,
        port: config.port,

        socket: {
            open(socket) {
                const session: Session = {
                    id: generateSessionId(),
                    socket,
                    state: 'AWAITING_USERNAME',
                    username: '',
                    tenant: '',
                    token: '',
                    cwd: '/',
                    env: {
                        API_URL: config.apiBaseUrl,
                        TERM: 'xterm',
                        SHELL: '/bin/monksh'
                    }
                };

                socket.data = {
                    session,
                    inputBuffer: ''
                };

                sessions.set(session.id, session);

                // Send telnet negotiation to disable client-side echo
                socket.write(TELNET_INIT);

                // Send MOTD and login prompt
                write(socket, config.motd || MOTD_DEFAULT);
                write(socket, '\nmonk login: ');
            },

            data(socket, data) {
                const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
                // Filter out telnet negotiation commands (IAC sequences)
                const filtered = filterTelnetCommands(bytes);
                if (filtered.length === 0) return;
                const text = new TextDecoder().decode(filtered);
                handleInput(socket, text, config);
            },

            close(socket) {
                if (socket.data?.session) {
                    sessions.delete(socket.data.session.id);
                }
            },

            error(socket, error) {
                // Ignore common connection errors
                const msg = error?.message || '';
                if (msg.includes('ECONNRESET') || msg.includes('EPIPE')) {
                    // Client disconnected abruptly - normal
                } else {
                    console.error('TTY socket error:', error);
                }
                if (socket.data?.session) {
                    sessions.delete(socket.data.session.id);
                }
            }
        }
    });

    console.log(`TTY server listening on ${config.host}:${config.port}`);
    return server;
}

/**
 * Write to socket
 */
function write(socket: Socket<SessionData>, text: string) {
    socket.write(text);
}

/**
 * Handle incoming data
 */
async function handleInput(socket: Socket<SessionData>, text: string, config: TTYConfig) {
    const { session } = socket.data;

    // Handle Ctrl+C (ETX) - close connection gracefully
    if (text.includes('\x03')) {
        write(socket, '\n^C\nConnection closed.\n');
        socket.end();
        return;
    }

    // Handle Ctrl+D (EOT) - logout/close
    if (text.includes('\x04')) {
        write(socket, '\nlogout\n');
        socket.end();
        return;
    }

    // Buffer input until newline
    socket.data.inputBuffer += text;

    // Echo input (except password)
    if (session.state !== 'AWAITING_PASSWORD') {
        // Handle backspace
        if (text === '\x7f' || text === '\b') {
            if (socket.data.inputBuffer.length > 0) {
                socket.data.inputBuffer = socket.data.inputBuffer.slice(0, -2);
                write(socket, '\b \b');
            }
            return;
        }
        write(socket, text);
    } else {
        // Mask password
        if (text === '\x7f' || text === '\b') {
            socket.data.inputBuffer = socket.data.inputBuffer.slice(0, -2);
            write(socket, '\b \b');
            return;
        }
        if (text !== '\r' && text !== '\n') {
            write(socket, '*');
        }
    }

    // Process complete lines
    if (!socket.data.inputBuffer.includes('\n') && !socket.data.inputBuffer.includes('\r')) {
        return;
    }

    const lines = socket.data.inputBuffer.split(/[\r\n]+/);
    socket.data.inputBuffer = lines.pop() || '';

    for (const line of lines) {
        const trimmed = line.trim();

        // Allow empty input for password prompt, skip otherwise
        if (!trimmed && session.state !== 'AWAITING_PASSWORD') {
            continue;
        }

        await processLine(socket, trimmed, config);
    }
}

/**
 * Process a complete input line
 */
async function processLine(socket: Socket<SessionData>, line: string, config: TTYConfig) {
    const { session } = socket.data;

    switch (session.state) {
        case 'AWAITING_USERNAME': {
            // Format: user@tenant or just user (uses default tenant)
            const [userPart, tenantPart] = line.split('@');
            session.username = userPart;
            session.tenant = tenantPart || session.env['DEFAULT_TENANT'] || '';

            if (!session.tenant) {
                write(socket, 'Tenant: ');
                session.state = 'AWAITING_PASSWORD'; // Temporarily store tenant
                session.env['_awaiting'] = 'tenant';
                return;
            }

            session.state = 'AWAITING_PASSWORD';
            write(socket, 'Password: ');
            return;
        }

        case 'AWAITING_PASSWORD': {
            // Check if we're actually awaiting tenant
            if (session.env['_awaiting'] === 'tenant') {
                session.tenant = line;
                delete session.env['_awaiting'];
                write(socket, '\nPassword: ');
                return;
            }

            // Attempt login (empty password is allowed - API will validate)
            try {
                const api = new ApiClient(config.apiBaseUrl, session);
                const password = line || undefined; // Send undefined for empty password
                const result = await api.login(session.tenant, session.username, password as string);

                if (result.success && result.data?.token) {
                    session.token = result.data.token;
                    session.state = 'AUTHENTICATED';
                    write(socket, '\n\n');
                    write(socket, `Welcome ${session.username}@${session.tenant}\n`);
                    write(socket, `Type 'help' for available commands.\n\n`);
                    printPrompt(socket);
                } else {
                    write(socket, '\nLogin incorrect\n\n');
                    session.state = 'AWAITING_USERNAME';
                    session.username = '';
                    session.tenant = '';
                    write(socket, 'monk login: ');
                }
            } catch (err) {
                console.error('TTY login error:', err);
                write(socket, '\nLogin error: ' + (err instanceof Error ? err.message : 'Unknown error') + '\n\n');
                session.state = 'AWAITING_USERNAME';
                session.username = '';
                session.tenant = '';
                write(socket, 'monk login: ');
            }
            return;
        }

        case 'AUTHENTICATED': {
            await executeCommand(socket, line);
            if (session.state === 'AUTHENTICATED') {
                printPrompt(socket);
            } else {
                // Logged out
                write(socket, '\nmonk login: ');
            }
            return;
        }
    }
}

/**
 * Print shell prompt
 */
function printPrompt(socket: Socket<SessionData>) {
    const { session } = socket.data;
    const shortCwd = session.cwd === '/' ? '/' : session.cwd.split('/').pop();
    write(socket, `monk:${shortCwd}$ `);
}

/**
 * Execute a shell command
 */
async function executeCommand(socket: Socket<SessionData>, line: string) {
    const { session } = socket.data;
    const parsed = parseCommand(line);

    if (!parsed) return;

    const handler = commands[parsed.command];
    if (!handler) {
        write(socket, `${parsed.command}: command not found\n`);
        return;
    }

    // Handle output redirect
    let output = '';
    const writeFunc = parsed.outputRedirect || parsed.appendRedirect
        ? (text: string) => { output += text; }
        : (text: string) => write(socket, text);

    try {
        await handler(session, parsed.args, writeFunc);

        // Handle redirect to file (create record)
        if (parsed.outputRedirect) {
            await handleOutputRedirect(socket, parsed.outputRedirect, output);
        }
    } catch (error) {
        write(socket, `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }
}

/**
 * Handle output redirect (> file)
 */
async function handleOutputRedirect(socket: Socket<SessionData>, target: string, output: string) {
    const { session } = socket.data;

    // Special case: > . means create in current model
    const resolvedPath = target === '.'
        ? session.cwd
        : resolvePath(session.cwd, target);

    const parts = resolvedPath.split('/').filter(Boolean);
    if (parts.length === 0) {
        write(socket, 'Cannot redirect to root\n');
        return;
    }

    const model = parts[0];

    try {
        const data = JSON.parse(output.trim());
        const api = new ApiClient(session.env['API_URL'] || 'http://localhost:3000', session);
        const result = await api.createRecord(model, data);

        if (result.success) {
            const id = result.data?.id || result.data?._id;
            write(socket, `Created: /${model}/${id}.json\n`);
        } else {
            write(socket, `Error: ${result.error}\n`);
        }
    } catch {
        write(socket, 'Error: Invalid JSON for redirect\n');
    }
}

/**
 * Default export for easy import
 */
export default createTTYServer;
