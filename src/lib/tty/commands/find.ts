/**
 * find - Recursively list directory contents
 *
 * Usage:
 *   find [path]        List all files/directories recursively
 *   find               Default to current directory
 *
 * Examples:
 *   find .             List everything from current directory
 *   find /api/data     List all models and records
 */

import { FSError } from '@src/lib/fs/index.js';
import type { FS } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';
import type { CommandIO } from '../types.js';

export const find: CommandHandler = async (session, fs, args, io) => {
    const target = args.find(a => !a.startsWith('-')) || '.';
    const resolved = resolvePath(session.cwd, target);

    try {
        await walkDirectory(fs!, resolved, io);
        return 0;
    } catch (err) {
        if (err instanceof FSError) {
            io.stderr.write(`find: ${target}: ${err.message}\n`);
            return 1;
        }
        throw err;
    }
};

/**
 * Recursively walk a directory and print all paths
 */
async function walkDirectory(
    fs: FS,
    path: string,
    io: CommandIO
): Promise<void> {
    // Print the current path
    io.stdout.write(path + '\n');

    try {
        const stat = await fs.stat(path);

        if (stat.type !== 'directory') {
            return;
        }

        const entries = await fs.readdir(path);

        // Sort alphabetically
        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            const childPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
            await walkDirectory(fs, childPath, io);
        }
    } catch {
        // If we can't read a directory, just skip it
    }
}
