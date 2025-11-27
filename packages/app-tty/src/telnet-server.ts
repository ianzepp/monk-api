/**
 * Telnet Transport
 *
 * TCP server with telnet protocol support.
 */

import type { Socket } from 'bun';
import type { TTYStream, Session, TTYConfig } from './transport.js';
import { createSession, generateSessionId } from './transport.js';
import { handleInput, sendWelcome } from './session-handler.js';

/**
 * Telnet protocol constants
 */
const TELNET_IAC = 255;
const TELNET_WILL = 251;
const TELNET_WONT = 252;
const TELNET_DO = 253;
const TELNET_DONT = 254;
const TELNET_ECHO = 1;
const TELNET_SGA = 3;

// Telnet negotiation: server handles echo, suppress go-ahead
const TELNET_INIT = new Uint8Array([
    TELNET_IAC, TELNET_WILL, TELNET_ECHO,
    TELNET_IAC, TELNET_WILL, TELNET_SGA,
    TELNET_IAC, TELNET_DO, TELNET_SGA,
]);

/**
 * Socket data for telnet connections
 */
interface TelnetSocketData {
    session: Session;
    stream: TelnetStream;
}

/**
 * TTYStream implementation for telnet sockets
 */
class TelnetStream implements TTYStream {
    private _isOpen = true;

    constructor(private socket: Socket<TelnetSocketData>) {}

    write(data: string | Uint8Array): void {
        if (!this._isOpen) return;
        this.socket.write(data);
    }

    end(): void {
        this._isOpen = false;
        this.socket.end();
    }

    get isOpen(): boolean {
        return this._isOpen;
    }
}

/**
 * Filter out telnet IAC commands and NUL bytes
 */
function filterTelnetCommands(data: Uint8Array): Uint8Array {
    const result: number[] = [];
    let i = 0;
    while (i < data.length) {
        // Skip NUL bytes
        if (data[i] === 0) {
            i++;
            continue;
        }
        if (data[i] === TELNET_IAC) {
            if (i + 1 < data.length) {
                const cmd = data[i + 1];
                if (cmd === TELNET_IAC) {
                    result.push(TELNET_IAC);
                    i += 2;
                } else if (cmd === TELNET_WILL || cmd === TELNET_WONT ||
                           cmd === TELNET_DO || cmd === TELNET_DONT) {
                    i += 3;
                } else {
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
 * Create telnet server
 */
export function createTelnetServer(config: TTYConfig) {
    const port = config.telnetPort || 2323;
    const host = config.telnetHost || '0.0.0.0';
    const sessions = new Map<string, Session>();

    const server = Bun.listen<TelnetSocketData>({
        hostname: host,
        port: port,

        socket: {
            open(socket) {
                const session = createSession(generateSessionId(), config.apiBaseUrl);
                const stream = new TelnetStream(socket);

                socket.data = { session, stream };
                sessions.set(session.id, session);

                // Send telnet negotiation
                socket.write(TELNET_INIT);

                // Send welcome
                sendWelcome(stream, config);
            },

            data(socket, data) {
                const bytes = typeof data === 'string'
                    ? new TextEncoder().encode(data)
                    : new Uint8Array(data);

                const filtered = filterTelnetCommands(bytes);
                if (filtered.length === 0) return;

                const text = new TextDecoder().decode(filtered);
                const { session, stream } = socket.data;

                // Handle Ctrl+C / Ctrl+D
                if (text.includes('\x03') || text.includes('\x04')) {
                    stream.write('\r\n^C\r\nConnection closed.\r\n');
                    stream.end();
                    return;
                }

                handleInput(stream, session, text, config, true);
            },

            close(socket) {
                if (socket.data?.session) {
                    sessions.delete(socket.data.session.id);
                }
            },

            error(socket, error) {
                const msg = error?.message || '';
                if (!msg.includes('ECONNRESET') && !msg.includes('EPIPE')) {
                    console.error('Telnet socket error:', error);
                }
                if (socket.data?.session) {
                    sessions.delete(socket.data.session.id);
                }
            }
        }
    });

    console.log(`Telnet server listening on ${host}:${port}`);
    return server;
}
