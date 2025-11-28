/**
 * TTY Profile & Session Initialization
 *
 * Handles:
 * - Home directory creation
 * - .profile loading and execution
 * - Command history load/save
 * - Session mount management
 */

import type { Session, TTYStream, CommandIO } from './types.js';
import type { FS } from '@src/lib/fs/index.js';
import { runTransaction } from '@src/lib/transaction.js';
import { LocalMount } from '@src/lib/fs/index.js';
import { BinMount } from '@src/lib/fs/mounts/bin-mount.js';
import { ProcMount } from '@src/lib/fs/mounts/proc-mount.js';
import { commands } from './commands.js';
import { executeLine, createIO } from './executor.js';

/**
 * Write to TTY stream with CRLF
 */
function writeToStream(stream: TTYStream, text: string): void {
    const normalized = text.replace(/(?<!\r)\n/g, '\r\n');
    stream.write(normalized);
}

/**
 * Initialize session after login
 *
 * Creates home directory, loads history, and executes .profile
 */
export async function initializeSession(stream: TTYStream, session: Session): Promise<void> {
    const home = session.env['HOME'] || `/home/${session.username}`;

    await ensureHomeDirectory(session, home);
    session.cwd = home;

    await loadHistory(session);
    await loadProfile(stream, session);
}

/**
 * Ensure home directory exists
 */
async function ensureHomeDirectory(session: Session, home: string): Promise<void> {
    if (!session.systemInit) return;

    try {
        await runTransaction(session.systemInit, async (system) => {
            if (!await system.fs.exists('/home')) {
                await system.fs.mkdir('/home');
            }
            if (!await system.fs.exists(home)) {
                await system.fs.mkdir(home);
            }
        });
    } catch {
        // Ignore errors - we'll just start in a non-existent dir
    }
}

/**
 * Load and execute ~/.profile
 *
 * Uses executeLine for each line, giving full scripting support
 */
async function loadProfile(stream: TTYStream, session: Session): Promise<void> {
    if (!session.systemInit) return;

    const profilePath = `/home/${session.username}/.profile`;

    try {
        await runTransaction(session.systemInit, async (system) => {
            // Check if .profile exists
            let content: string;
            try {
                const buffer = await system.fs.read(profilePath);
                content = buffer.toString();
            } catch {
                // No .profile file
                return;
            }

            // Apply session mounts
            applySessionMounts(session, system.fs);

            // Create IO that discards stdout, shows stderr
            const io = createIO();
            io.stdin.end();
            io.stderr.on('data', (chunk) => writeToStream(stream, chunk.toString()));

            // Execute each line
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                if (trimmed.startsWith('#!')) continue; // shebang

                await executeLine(session, trimmed, io, {
                    fs: system.fs,
                    useTransaction: false,
                });
            }
        });
    } catch {
        // Ignore profile load errors
    }
}

/**
 * Load command history from ~/.history
 */
export async function loadHistory(session: Session): Promise<void> {
    if (!session.systemInit) return;

    try {
        await runTransaction(session.systemInit, async (system) => {
            const historyPath = `/home/${session.username}/.history`;

            try {
                const content = await system.fs.read(historyPath);
                session.history = content.toString().split('\n').filter(Boolean);
            } catch {
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
        await runTransaction(session.systemInit, async (system) => {
            const historyPath = `/home/${session.username}/.history`;
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
 * Apply session-specific mounts to a FS instance
 *
 * Mounts:
 * - /bin: Built-in commands
 * - /proc: Process filesystem with /proc/self
 * - User mounts: Local filesystem mounts from mount command
 */
export function applySessionMounts(session: Session, fs: FS): void {
    // Mount /bin with command names (filter out special chars like '.' and '[')
    const commandNames = Object.keys(commands).filter(name => /^[a-zA-Z]/.test(name));
    fs.mount('/bin', new BinMount(commandNames));

    // Re-mount /proc with session PID for /proc/self
    if (session.pid !== null) {
        fs.mount('/proc', new ProcMount(session.tenant, session.pid));
    }

    // Apply user-created local mounts
    for (const [virtualPath, mountInfo] of session.mounts) {
        if (mountInfo.type === 'local') {
            const mount = new LocalMount(mountInfo.path, {
                writable: !mountInfo.readonly,
            });
            fs.mount(virtualPath, mount);
        }
    }
}
