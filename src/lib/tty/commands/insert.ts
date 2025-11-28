/**
 * insert - Create records
 *
 * Usage:
 *   insert <path>                    Read JSON from stdin
 *   insert <path> '<json>'           Inline JSON
 *
 * Path should be a collection: /api/data/users
 *
 * Examples:
 *   echo '{"name":"bob"}' | insert /api/data/users
 *   insert /api/data/users '{"name":"bob"}'
 *   cat records.json | insert /api/data/users
 *
 * Outputs the created record(s) as JSON.
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const insert: CommandHandler = async (session, fs, args, io) => {
    if (!fs) {
        io.stderr.write('insert: filesystem not available\n');
        return 1;
    }

    if (args.length === 0) {
        io.stderr.write('insert: missing path\n');
        io.stderr.write('Usage: insert <path> [json]\n');
        return 1;
    }

    const pathArg = args[0];
    const resolved = resolvePath(session.cwd, pathArg);

    // Get JSON from args or stdin
    let jsonStr: string;
    if (args.length > 1) {
        jsonStr = args.slice(1).join(' ');
    } else {
        // Read from stdin
        const chunks: string[] = [];
        for await (const chunk of io.stdin) {
            chunks.push(chunk.toString());
        }
        jsonStr = chunks.join('');
    }

    if (!jsonStr.trim()) {
        io.stderr.write('insert: no data provided\n');
        return 1;
    }

    // Parse JSON
    let data: any;
    try {
        data = JSON.parse(jsonStr);
    } catch {
        io.stderr.write('insert: invalid JSON\n');
        return 1;
    }

    // Handle array of records or single record
    const records = Array.isArray(data) ? data : [data];

    try {
        // Verify path is a directory (collection)
        const stat = await fs.stat(resolved);
        if (stat.type !== 'directory') {
            io.stderr.write(`insert: ${pathArg}: not a collection\n`);
            return 1;
        }

        const results: any[] = [];

        for (const record of records) {
            if (io.signal?.aborted) return 130;

            // Generate ID if not provided
            const id = record.id || crypto.randomUUID();
            const recordPath = `${resolved}/${id}`;

            // Check if exists
            try {
                await fs.stat(recordPath);
                io.stderr.write(`insert: ${id}: already exists\n`);
                return 1;
            } catch (err) {
                if (!(err instanceof FSError && err.code === 'ENOENT')) {
                    throw err;
                }
                // Good - doesn't exist
            }

            // Write the record
            await fs.write(recordPath, JSON.stringify({ ...record, id }));

            // Read back to get the full record with defaults
            const created = await fs.read(recordPath);
            results.push(JSON.parse(created.toString()));
        }

        // Output results
        if (results.length === 1) {
            io.stdout.write(JSON.stringify(results[0], null, 2) + '\n');
        } else {
            io.stdout.write(JSON.stringify(results, null, 2) + '\n');
        }

        return 0;
    } catch (err) {
        if (err instanceof FSError) {
            io.stderr.write(`insert: ${pathArg}: ${err.message}\n`);
            return 1;
        }
        throw err;
    }
};
