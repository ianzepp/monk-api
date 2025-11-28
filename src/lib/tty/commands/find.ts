/**
 * find - Recursively list directory contents
 *
 * Usage:
 *   find [path]           List all files/directories recursively
 *   find [path] -type f   List only files
 *   find [path] -type d   List only directories
 *   find [path] -maxdepth N  Limit recursion depth
 *   find                  Default to current directory
 *
 * Examples:
 *   find .                List everything from current directory
 *   find /api/data        List all models and records
 *   find /api/data -type f   List only files (for xargs)
 *   find / -maxdepth 2    List root with 2 levels of depth
 */

import { FSError } from '@src/lib/fs/index.js';
import type { FS } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';
import type { CommandIO } from '../types.js';

type FindOptions = {
    typeFilter?: 'f' | 'd';
    maxDepth?: number;
};

/** Maximum recursion depth to prevent infinite loops */
const DEFAULT_MAX_DEPTH = 100;

export const find: CommandHandler = async (session, fs, args, io) => {
    const options: FindOptions = {};

    // Parse -type flag
    const typeIndex = args.indexOf('-type');
    if (typeIndex !== -1 && args[typeIndex + 1]) {
        const typeArg = args[typeIndex + 1];
        if (typeArg === 'f' || typeArg === 'd') {
            options.typeFilter = typeArg;
        }
    }

    // Parse -maxdepth flag
    const maxDepthIndex = args.indexOf('-maxdepth');
    if (maxDepthIndex !== -1 && args[maxDepthIndex + 1]) {
        const depth = parseInt(args[maxDepthIndex + 1], 10);
        if (!isNaN(depth) && depth >= 0) {
            options.maxDepth = depth;
        }
    }

    const target = args.find(a => !a.startsWith('-') && a !== 'f' && a !== 'd' && !/^\d+$/.test(a)) || '.';
    const resolved = resolvePath(session.cwd, target);

    try {
        const visited = new Set<string>();
        const aborted = await walkDirectory(fs!, resolved, io, options, 0, visited);
        return aborted ? 130 : 0;
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
 * Returns true if aborted, false otherwise
 */
async function walkDirectory(
    fs: FS,
    path: string,
    io: CommandIO,
    options: FindOptions,
    depth: number,
    visited: Set<string>
): Promise<boolean> {
    // Check for abort signal
    if (io.signal?.aborted) {
        return true;
    }

    // Prevent infinite loops via visited set
    if (visited.has(path)) {
        return false;
    }
    visited.add(path);

    // Check max depth
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    if (depth > maxDepth) {
        return false;
    }

    try {
        const stat = await fs.stat(path);
        const isDir = stat.type === 'directory';

        // Follow symlinks - check for loops
        if (stat.type === 'symlink' && stat.target) {
            if (visited.has(stat.target)) {
                // Symlink loop detected - skip
                return false;
            }
        }

        // Apply type filter
        const shouldPrint =
            !options.typeFilter ||
            (options.typeFilter === 'f' && !isDir) ||
            (options.typeFilter === 'd' && isDir);

        if (shouldPrint) {
            io.stdout.write(path + '\n');
        }

        if (!isDir) {
            return false;
        }

        const entries = await fs.readdir(path);

        // Sort alphabetically
        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            // Check abort signal between entries for responsiveness
            if (io.signal?.aborted) {
                return true;
            }

            const childPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
            const aborted = await walkDirectory(fs, childPath, io, options, depth + 1, visited);
            if (aborted) {
                return true;
            }
        }
    } catch {
        // If we can't read a directory, just skip it
    }
    return false;
}
