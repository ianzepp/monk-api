/**
 * Shared types and helpers for TTY commands
 */

import type { FS, FSEntry } from '@src/lib/fs/index.js';
import type { Session, CommandIO } from '../types.js';

/**
 * Command handler signature
 *
 * Commands receive:
 * - session: User session context
 * - fs: Virtual filesystem (null for commands that don't need it)
 * - args: Command arguments (already variable-expanded)
 * - io: Standard I/O streams (stdin, stdout, stderr)
 *
 * Returns exit code (0 = success, non-zero = error)
 */
export type CommandHandler = (
    session: Session,
    fs: FS | null,
    args: string[],
    io: CommandIO
) => Promise<number>;

/**
 * Format mode as permission string
 */
export function formatMode(type: string, mode: number): string {
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
export function formatEntry(entry: FSEntry, long: boolean): string {
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
