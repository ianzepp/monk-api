/**
 * TTY Commands
 *
 * Shell commands implemented using the FS layer.
 * Each command receives the session, FS instance, args, and write function.
 */

import type { FS, FSEntry } from '@src/lib/fs/index.js';
import { FSError } from '@src/lib/fs/index.js';
import type { Session, WriteFunction } from './types.js';
import { resolvePath } from './parser.js';

/**
 * Command handler signature
 */
export type CommandHandler = (
    session: Session,
    fs: FS,
    args: string[],
    write: WriteFunction
) => Promise<void>;

/**
 * Command registry
 */
export const commands: Record<string, CommandHandler> = {};

// ============================================================================
// Navigation Commands
// ============================================================================

/**
 * pwd - Print working directory
 */
commands['pwd'] = async (session, _fs, _args, write) => {
    write(session.cwd + '\n');
};

/**
 * cd - Change directory
 */
commands['cd'] = async (session, fs, args, write) => {
    const target = args[0] || '/';
    const resolved = resolvePath(session.cwd, target);

    try {
        const stat = await fs.stat(resolved);
        if (stat.type !== 'directory') {
            write(`cd: ${target}: Not a directory\n`);
            return;
        }
        session.cwd = resolved;
    } catch (err) {
        if (err instanceof FSError) {
            write(`cd: ${target}: ${err.message}\n`);
        } else {
            throw err;
        }
    }
};

// ============================================================================
// Listing Commands
// ============================================================================

/**
 * ls - List directory contents
 */
commands['ls'] = async (session, fs, args, write) => {
    const longFormat = args.includes('-l');
    const showAll = args.includes('-a');
    const target = args.find(a => !a.startsWith('-')) || session.cwd;
    const resolved = resolvePath(session.cwd, target);

    try {
        const stat = await fs.stat(resolved);

        if (stat.type !== 'directory') {
            // Single file
            write(formatEntry(stat, longFormat) + '\n');
            return;
        }

        const entries = await fs.readdir(resolved);

        // Sort entries: directories first, then alphabetically
        entries.sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
        });

        if (longFormat) {
            write(`total ${entries.length}\n`);
            for (const entry of entries) {
                if (!showAll && entry.name.startsWith('.')) continue;
                write(formatEntry(entry, true) + '\n');
            }
        } else {
            const names = entries
                .filter(e => showAll || !e.name.startsWith('.'))
                .map(e => e.name + (e.type === 'directory' ? '/' : ''));
            write(names.join('  ') + '\n');
        }
    } catch (err) {
        if (err instanceof FSError) {
            write(`ls: ${target}: ${err.message}\n`);
        } else {
            throw err;
        }
    }
};

// ============================================================================
// File Operations
// ============================================================================

/**
 * cat - Display file contents
 */
commands['cat'] = async (session, fs, args, write) => {
    if (args.length === 0) {
        write('cat: missing operand\n');
        return;
    }

    for (const arg of args) {
        if (arg.startsWith('-')) continue;
        const resolved = resolvePath(session.cwd, arg);

        try {
            const content = await fs.read(resolved);
            write(content.toString());
            if (!content.toString().endsWith('\n')) {
                write('\n');
            }
        } catch (err) {
            if (err instanceof FSError) {
                write(`cat: ${arg}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};

/**
 * touch - Create empty file
 */
commands['touch'] = async (session, fs, args, write) => {
    if (args.length === 0) {
        write('touch: missing operand\n');
        return;
    }

    for (const arg of args) {
        const resolved = resolvePath(session.cwd, arg);

        try {
            const exists = await fs.exists(resolved);
            if (!exists) {
                await fs.write(resolved, '');
            }
        } catch (err) {
            if (err instanceof FSError) {
                write(`touch: ${arg}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};

/**
 * rm - Remove file
 */
commands['rm'] = async (session, fs, args, write) => {
    const force = args.includes('-f');
    const files = args.filter(a => !a.startsWith('-'));

    if (files.length === 0) {
        write('rm: missing operand\n');
        return;
    }

    for (const file of files) {
        const resolved = resolvePath(session.cwd, file);

        try {
            await fs.unlink(resolved);
        } catch (err) {
            if (err instanceof FSError) {
                if (!force) {
                    write(`rm: ${file}: ${err.message}\n`);
                }
            } else {
                throw err;
            }
        }
    }
};

/**
 * mkdir - Create directory
 */
commands['mkdir'] = async (session, fs, args, write) => {
    const parents = args.includes('-p');
    const dirs = args.filter(a => !a.startsWith('-'));

    if (dirs.length === 0) {
        write('mkdir: missing operand\n');
        return;
    }

    for (const dir of dirs) {
        const resolved = resolvePath(session.cwd, dir);

        try {
            if (parents) {
                // Create parent directories as needed
                const parts = resolved.split('/').filter(Boolean);
                let current = '';
                for (const part of parts) {
                    current += '/' + part;
                    const exists = await fs.exists(current);
                    if (!exists) {
                        await fs.mkdir(current);
                    }
                }
            } else {
                await fs.mkdir(resolved);
            }
        } catch (err) {
            if (err instanceof FSError) {
                write(`mkdir: ${dir}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};

/**
 * rmdir - Remove directory
 */
commands['rmdir'] = async (session, fs, args, write) => {
    if (args.length === 0) {
        write('rmdir: missing operand\n');
        return;
    }

    for (const dir of args) {
        if (dir.startsWith('-')) continue;
        const resolved = resolvePath(session.cwd, dir);

        try {
            await fs.rmdir(resolved);
        } catch (err) {
            if (err instanceof FSError) {
                write(`rmdir: ${dir}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};

/**
 * mv - Move/rename file or directory
 */
commands['mv'] = async (session, fs, args, write) => {
    const files = args.filter(a => !a.startsWith('-'));

    if (files.length < 2) {
        write('mv: missing destination\n');
        return;
    }

    const dest = resolvePath(session.cwd, files.pop()!);
    const sources = files.map(f => resolvePath(session.cwd, f));

    for (const src of sources) {
        try {
            await fs.rename(src, dest);
        } catch (err) {
            if (err instanceof FSError) {
                write(`mv: ${src}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};

// ============================================================================
// Information Commands
// ============================================================================

/**
 * echo - Output text
 */
commands['echo'] = async (_session, _fs, args, write) => {
    write(args.join(' ') + '\n');
};

/**
 * whoami - Display current user
 */
commands['whoami'] = async (session, _fs, _args, write) => {
    write(session.username + '\n');
};

/**
 * env - Display environment variables
 */
commands['env'] = async (session, _fs, _args, write) => {
    for (const [key, value] of Object.entries(session.env)) {
        write(`${key}=${value}\n`);
    }
};

/**
 * export - Set environment variable
 */
commands['export'] = async (session, _fs, args, write) => {
    for (const arg of args) {
        const eq = arg.indexOf('=');
        if (eq > 0) {
            const key = arg.slice(0, eq);
            const value = arg.slice(eq + 1);
            session.env[key] = value;
        } else {
            write(`export: ${arg}: invalid format (use KEY=value)\n`);
        }
    }
};

// ============================================================================
// Session Commands
// ============================================================================

/**
 * clear - Clear screen
 */
commands['clear'] = async (_session, _fs, _args, write) => {
    write('\x1b[2J\x1b[H');
};

/**
 * help - Show available commands
 */
commands['help'] = async (_session, _fs, _args, write) => {
    write('Available commands:\n');
    write('  Navigation:  cd, pwd, ls\n');
    write('  Files:       cat, touch, rm, mv\n');
    write('  Directories: mkdir, rmdir\n');
    write('  Info:        echo, whoami, env, export\n');
    write('  Session:     clear, help, exit\n');
    write('\nPaths:\n');
    write('  /api/data      - Model records (CRUD)\n');
    write('  /api/describe  - Model schemas\n');
    write('  /api/find      - Saved queries\n');
    write('  /api/trashed   - Soft-deleted records\n');
    write('  /system        - System info\n');
    write('  /home, /tmp    - File storage\n');
};

/**
 * exit/logout/quit - End session
 */
commands['exit'] = async (session, _fs, _args, _write) => {
    // Reset session state (handled by session-handler)
    session.state = 'AWAITING_USERNAME';
    session.username = '';
    session.tenant = '';
    session.systemInit = null;
    session.cwd = '/';

    // Run cleanup handlers
    for (const cleanup of session.cleanupHandlers) {
        try {
            cleanup();
        } catch {
            // Ignore cleanup errors
        }
    }
    session.cleanupHandlers = [];
};

commands['logout'] = commands['exit'];
commands['quit'] = commands['exit'];

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format mode as permission string
 */
function formatMode(type: string, mode: number): string {
    const typeChar = type === 'directory' ? 'd' : type === 'symlink' ? 'l' : '-';

    const perms = [
        (mode & 0o400) ? 'r' : '-',
        (mode & 0o200) ? 'w' : '-',
        (mode & 0o100) ? 'x' : '-',
        (mode & 0o040) ? 'r' : '-',
        (mode & 0o020) ? 'w' : '-',
        (mode & 0o010) ? 'x' : '-',
        (mode & 0o004) ? 'r' : '-',
        (mode & 0o002) ? 'w' : '-',
        (mode & 0o001) ? 'x' : '-',
    ].join('');

    return typeChar + perms;
}

/**
 * Format entry for ls output
 */
function formatEntry(entry: FSEntry, long: boolean): string {
    const suffix = entry.type === 'directory' ? '/' : '';

    if (!long) {
        return entry.name + suffix;
    }

    const mode = formatMode(entry.type, entry.mode);
    const size = String(entry.size).padStart(8);
    const date = entry.mtime
        ? entry.mtime.toISOString().slice(0, 10)
        : '          ';

    return `${mode}  ${size}  ${date}  ${entry.name}${suffix}`;
}
