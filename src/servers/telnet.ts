/**
 * Telnet Server
 *
 * TCP server implementing basic telnet protocol for TTY access.
 * Uses Bun's native socket API.
 */

import type { Socket } from 'bun';
import type { Session, TTYStream, TTYConfig } from '@src/lib/tty/types.js';
import { createSession, generateSessionId } from '@src/lib/tty/types.js';
import { handleInput, sendWelcome, saveHistory, handleInterrupt } from '@src/lib/tty/session-handler.js';
import { terminateDaemon } from '@src/lib/process.js';

/**
 * Socket data associated with each connection
 */
interface TelnetSocketData {
    session: Session;
    stream: TTYStream;
}

/**
 * TTYStream implementation for Telnet connections
 */
class TelnetStream implements TTYStream {
    private _isOpen = true;

    constructor(private socket: Socket<TelnetSocketData>) {}

    write(data: string | Uint8Array): void {
        if (!this._isOpen) return;

        try {
            if (typeof data === 'string') {
                this.socket.write(data);
            } else {
                this.socket.write(data);
            }
        } catch {
            this._isOpen = false;
        }
    }

    end(): void {
        this._isOpen = false;
        try {
            this.socket.end();
        } catch {
            // Socket may already be closed
        }
    }

    get isOpen(): boolean {
        return this._isOpen;
    }
}

/**
 * Telnet protocol constants
 */
const TELNET = {
    IAC: 255, // Interpret As Command
    WILL: 251,
    WONT: 252,
    DO: 253,
    DONT: 254,
    ECHO: 1,
    SGA: 3, // Suppress Go Ahead
};

export interface TelnetServerHandle {
    stop: () => void;
}

/**
 * Create and start a Telnet server
 *
 * @param config - Server configuration
 * @returns Server instance with stop() method
 */
export function startTelnetServer(config?: TTYConfig): TelnetServerHandle {
    const port = config?.telnetPort ?? 2323;
    const hostname = config?.telnetHost ?? '0.0.0.0';

    const server = Bun.listen<TelnetSocketData>({
        hostname,
        port,

        socket: {
            open(socket) {
                const session = createSession(generateSessionId());
                const stream = new TelnetStream(socket);

                socket.data = { session, stream };

                // Send telnet negotiation: WILL ECHO, WILL SGA
                socket.write(
                    new Uint8Array([
                        TELNET.IAC,
                        TELNET.WILL,
                        TELNET.ECHO,
                        TELNET.IAC,
                        TELNET.WILL,
                        TELNET.SGA,
                    ])
                );

                // Send welcome message
                sendWelcome(stream, config);

                console.info(
                    `Telnet: New connection from ${socket.remoteAddress} (session ${session.id})`
                );
            },

            async data(socket, data) {
                const { session, stream } = socket.data;

                // Filter telnet commands and control characters
                const filtered = filterTelnetData(data);
                if (filtered.length === 0) return;

                // Check for Ctrl+C or Ctrl+D
                for (const byte of filtered) {
                    if (byte === 0x03) {
                        // CTRL+C - try to interrupt foreground command
                        const handled = handleInterrupt(stream, session);
                        if (!handled) {
                            console.info(`Telnet: Session ${session.id} disconnect via Ctrl+C`);
                            socket.end();
                        }
                        return;
                    }
                    if (byte === 0x04) {
                        // CTRL+D - always disconnect
                        console.info(`Telnet: Session ${session.id} disconnect via Ctrl+D`);
                        socket.end();
                        return;
                    }
                }

                // Handle input
                try {
                    await handleInput(
                        stream,
                        session,
                        filtered,
                        config,
                        session.state !== 'AWAITING_PASSWORD'
                    );
                } catch (err) {
                    console.error(`Telnet: Error in session ${session.id}:`, err);
                    stream.write(`\r\nInternal error\r\n`);
                }
            },

            async close(socket) {
                const { session } = socket.data;
                console.info(`Telnet: Session ${session.id} closed`);

                // Terminate shell process
                if (session.pid) {
                    try {
                        await terminateDaemon(session.pid, 0);
                    } catch {
                        // Ignore termination errors
                    }
                }

                // Save command history
                await saveHistory(session);

                // Run cleanup handlers
                for (const cleanup of session.cleanupHandlers) {
                    try {
                        cleanup();
                    } catch {
                        // Ignore cleanup errors
                    }
                }
            },

            error(socket, error) {
                console.error(
                    `Telnet: Socket error for session ${socket.data?.session?.id}:`,
                    error
                );
            },
        },
    });

    console.info(`Telnet server listening on ${hostname}:${port}`);

    return {
        stop: () => {
            server.stop();
            console.info('Telnet server stopped');
        },
    };
}

/**
 * Filter telnet IAC commands and NUL bytes from input
 */
function filterTelnetData(data: Buffer): Uint8Array {
    const result: number[] = [];
    let i = 0;

    while (i < data.length) {
        const byte = data[i];

        // Skip NUL bytes
        if (byte === 0) {
            i++;
            continue;
        }

        // Handle telnet IAC sequences
        if (byte === TELNET.IAC) {
            if (i + 1 >= data.length) break;

            const cmd = data[i + 1];

            // IAC IAC = literal 255
            if (cmd === TELNET.IAC) {
                result.push(255);
                i += 2;
                continue;
            }

            // WILL/WONT/DO/DONT + option
            if (cmd >= TELNET.WILL && cmd <= TELNET.DONT) {
                i += 3;
                continue;
            }

            // Other command
            i += 2;
            continue;
        }

        result.push(byte);
        i++;
    }

    return new Uint8Array(result);
}
