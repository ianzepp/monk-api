/**
 * SSH Transport
 *
 * SSH server using ssh2 library.
 * More secure than telnet - encrypted, supports key auth.
 */

import { Server, type ServerChannel, type Connection } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { generateKeyPairSync } from 'crypto';
import { writeFileSync } from 'fs';
import type { TTYStream, Session, TTYConfig } from './transport.js';
import { createSession, generateSessionId } from './transport.js';
import { handleInput, sendWelcome } from './session-handler.js';
import { ApiClient } from './api-client.js';

/**
 * TTYStream implementation for SSH channels
 */
class SSHStream implements TTYStream {
    private _isOpen = true;

    constructor(private channel: ServerChannel) {
        channel.on('close', () => {
            this._isOpen = false;
        });
    }

    write(data: string | Uint8Array): void {
        if (!this._isOpen) return;
        // SSH needs CRLF like telnet
        const text = typeof data === 'string'
            ? data.replace(/\r?\n/g, '\r\n')
            : data;
        this.channel.write(text);
    }

    end(): void {
        this._isOpen = false;
        this.channel.end();
    }

    get isOpen(): boolean {
        return this._isOpen;
    }
}

/**
 * Generate a host key if none exists
 */
function getOrCreateHostKey(keyPath?: string): Buffer {
    const defaultPath = './ssh_host_key';
    const path = keyPath || defaultPath;

    if (existsSync(path)) {
        return readFileSync(path);
    }

    // Generate new RSA key pair
    console.log('Generating SSH host key...');
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: {
            type: 'pkcs1',
            format: 'pem'
        },
        publicKeyEncoding: {
            type: 'pkcs1',
            format: 'pem'
        }
    });

    writeFileSync(path, privateKey);
    console.log(`SSH host key saved to ${path}`);
    return Buffer.from(privateKey);
}

/**
 * Create SSH server
 */
export function createSSHServer(config: TTYConfig) {
    const port = config.sshPort || 2222;
    const host = config.sshHost || '0.0.0.0';
    const sessions = new Map<string, Session>();

    const hostKey = getOrCreateHostKey(config.sshHostKey);

    const server = new Server({
        hostKeys: [hostKey]
    }, (client: Connection) => {
        let session: Session | null = null;
        let pendingUsername: string | null = null;
        let pendingTenant: string | null = null;

        client.on('authentication', async (ctx) => {
            // Parse username as user@tenant
            const [userPart, tenantPart] = ctx.username.split('@');
            pendingUsername = userPart;
            pendingTenant = tenantPart || '';

            if (ctx.method === 'password') {
                // Verify against Monk API
                const tempSession = createSession('temp', config.apiBaseUrl);
                const api = new ApiClient(config.apiBaseUrl, tempSession);

                try {
                    const result = await api.login(pendingTenant, pendingUsername, ctx.password);
                    if (result.success && result.data?.token) {
                        // Create real session with token
                        session = createSession(generateSessionId(), config.apiBaseUrl);
                        session.username = pendingUsername;
                        session.tenant = pendingTenant;
                        session.token = result.data.token;
                        session.state = 'AUTHENTICATED';
                        sessions.set(session.id, session);
                        ctx.accept();
                    } else {
                        ctx.reject(['password']);
                    }
                } catch {
                    ctx.reject(['password']);
                }
            } else if (ctx.method === 'none') {
                // Try passwordless login
                const tempSession = createSession('temp', config.apiBaseUrl);
                const api = new ApiClient(config.apiBaseUrl, tempSession);

                try {
                    const result = await api.login(pendingTenant, pendingUsername, undefined as any);
                    if (result.success && result.data?.token) {
                        session = createSession(generateSessionId(), config.apiBaseUrl);
                        session.username = pendingUsername;
                        session.tenant = pendingTenant;
                        session.token = result.data.token;
                        session.state = 'AUTHENTICATED';
                        sessions.set(session.id, session);
                        ctx.accept();
                    } else {
                        // Require password
                        ctx.reject(['password']);
                    }
                } catch {
                    ctx.reject(['password']);
                }
            } else {
                ctx.reject(['password']);
            }
        });

        client.on('ready', () => {
            client.on('session', (accept) => {
                const sshSession = accept();

                sshSession.on('pty', (accept) => {
                    accept?.();
                });

                sshSession.on('shell', (accept) => {
                    const channel = accept();
                    if (!session) return;

                    const stream = new SSHStream(channel);

                    // Already authenticated via SSH - show welcome and prompt
                    stream.write('\r\n');
                    stream.write(`Welcome ${session.username}@${session.tenant}\r\n`);
                    stream.write(`Type 'help' for available commands.\r\n\r\n`);

                    const shortCwd = session.cwd === '/' ? '/' : session.cwd.split('/').pop();
                    stream.write(`monk:${shortCwd}$ `);

                    channel.on('data', (data: Buffer) => {
                        const text = data.toString();

                        // Handle Ctrl+C / Ctrl+D
                        if (text.includes('\x03') || text.includes('\x04')) {
                            stream.write('\r\n^C\r\nConnection closed.\r\n');
                            stream.end();
                            return;
                        }

                        // SSH doesn't need NUL byte filtering like telnet
                        handleInput(stream, session!, text, config, true);
                    });

                    channel.on('close', () => {
                        if (session) {
                            sessions.delete(session.id);
                        }
                    });
                });

                // Handle exec requests (single commands)
                sshSession.on('exec', (accept, _reject, info) => {
                    const channel = accept();
                    if (!session) return;

                    const stream = new SSHStream(channel);

                    // Execute the command directly
                    session.inputBuffer = info.command;
                    handleInput(stream, session, '\r', config, false);

                    // Close after output
                    setTimeout(() => stream.end(), 100);
                });
            });
        });

        client.on('error', (err) => {
            // Ignore common errors
            if (!err.message?.includes('ECONNRESET')) {
                console.error('SSH client error:', err.message);
            }
        });

        client.on('close', () => {
            if (session) {
                sessions.delete(session.id);
            }
        });
    });

    server.listen(port, host, () => {
        console.log(`SSH server listening on ${host}:${port}`);
    });

    return server;
}
