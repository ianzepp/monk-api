/**
 * delete - Delete records
 *
 * Usage:
 *   delete <path>...                 Delete specific records
 *   delete <collection>              Read IDs from stdin
 *
 * Examples:
 *   delete /api/data/users/123
 *   delete /api/data/users/123 /api/data/users/456
 *   echo -e "123\n456" | delete /api/data/users
 *   ls /api/data/users | delete /api/data/users
 *
 * Outputs the deleted record(s) as JSON.
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const delete_: CommandHandler = async (session, fs, args, io) => {
    if (!fs) {
        io.stderr.write('delete: filesystem not available\n');
        return 1;
    }

    if (args.length === 0) {
        io.stderr.write('delete: missing path\n');
        io.stderr.write('Usage: delete <path>...\n');
        return 1;
    }

    const results: any[] = [];
    let exitCode = 0;

    // Check if first arg is a collection (for stdin mode)
    const firstPath = resolvePath(session.cwd, args[0]);
    let isCollection = false;

    try {
        const stat = await fs.stat(firstPath);
        isCollection = stat.type === 'directory';
    } catch {
        // Not found, will error below
    }

    // If single arg is a collection, read IDs from stdin
    if (args.length === 1 && isCollection) {
        const chunks: string[] = [];
        for await (const chunk of io.stdin) {
            chunks.push(chunk.toString());
        }
        const input = chunks.join('');

        if (!input.trim()) {
            io.stderr.write('delete: no IDs provided on stdin\n');
            return 1;
        }

        // Parse IDs (one per line, or JSON array)
        let ids: string[];
        try {
            ids = JSON.parse(input);
            if (!Array.isArray(ids)) {
                ids = [ids];
            }
        } catch {
            // Not JSON, treat as newline-separated IDs
            ids = input.split('\n').map(s => s.trim()).filter(Boolean);
        }

        for (const id of ids) {
            if (io.signal?.aborted) return 130;

            const recordPath = `${firstPath}/${id}`;
            try {
                const content = await fs.read(recordPath);
                const record = JSON.parse(content.toString());
                await fs.unlink(recordPath);
                results.push(record);
            } catch (err) {
                if (err instanceof FSError) {
                    io.stderr.write(`delete: ${id}: ${err.code === 'ENOENT' ? 'not found' : err.message}\n`);
                    exitCode = 1;
                } else {
                    throw err;
                }
            }
        }
    } else {
        // Delete each path argument
        for (const pathArg of args) {
            if (io.signal?.aborted) return 130;

            const resolved = resolvePath(session.cwd, pathArg);

            try {
                const stat = await fs.stat(resolved);
                if (stat.type === 'directory') {
                    io.stderr.write(`delete: ${pathArg}: is a collection (specify record path)\n`);
                    exitCode = 1;
                    continue;
                }

                const content = await fs.read(resolved);
                const record = JSON.parse(content.toString());
                await fs.unlink(resolved);
                results.push(record);
            } catch (err) {
                if (err instanceof FSError) {
                    io.stderr.write(`delete: ${pathArg}: ${err.code === 'ENOENT' ? 'not found' : err.message}\n`);
                    exitCode = 1;
                } else {
                    throw err;
                }
            }
        }
    }

    // Output deleted records
    if (results.length > 0) {
        if (results.length === 1) {
            io.stdout.write(JSON.stringify(results[0], null, 2) + '\n');
        } else {
            io.stdout.write(JSON.stringify(results, null, 2) + '\n');
        }
    }

    return exitCode;
};

// Export as 'delete' for command registry
export { delete_ as delete };
