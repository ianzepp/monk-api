/**
 * Shared types and helpers for TTY commands
 */

import type { FS, FSEntry } from '@src/lib/fs/index.js';
import type { Session, WriteFunction } from '../types.js';

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
