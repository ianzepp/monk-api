/**
 * update - Update records
 *
 * Usage:
 *   update <path>                         Read JSON from stdin
 *   update <path> '<json>'                Inline JSON
 *   update <path> field=value ...         Field-value pairs
 *
 * Path should be a record: /api/data/users/123
 *
 * Examples:
 *   echo '{"status":"active"}' | update /api/data/users/123
 *   update /api/data/users/123 '{"status":"active"}'
 *   update /api/data/users/123 status=active name="John Doe"
 *
 * Outputs the updated record as JSON.
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

/**
 * Parse field=value arguments into an object
 */
function parseFieldValues(args: string[]): Record<string, any> | null {
    // Check if args look like field=value pairs
    if (!args.some(arg => arg.includes('='))) {
        return null;
    }

    const result: Record<string, any> = {};

    for (const arg of args) {
        const eqIndex = arg.indexOf('=');
        if (eqIndex === -1) {
            continue;
        }

        const key = arg.slice(0, eqIndex);
        let value: any = arg.slice(eqIndex + 1);

        // Try to parse value as JSON (for numbers, booleans, arrays, objects)
        try {
            value = JSON.parse(value);
        } catch {
            // Keep as string - remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
        }

        result[key] = value;
    }

    return Object.keys(result).length > 0 ? result : null;
}

export const update: CommandHandler = async (session, fs, args, io) => {
    if (!fs) {
        io.stderr.write('update: filesystem not available\n');
        return 1;
    }

    if (args.length === 0) {
        io.stderr.write('update: missing path\n');
        io.stderr.write('Usage: update <path> [json | field=value ...]\n');
        return 1;
    }

    const pathArg = args[0];
    const resolved = resolvePath(session.cwd, pathArg);

    // Get data from args or stdin
    let changes: any;

    if (args.length > 1) {
        // Try field=value syntax first
        const fieldValues = parseFieldValues(args.slice(1));
        if (fieldValues) {
            changes = fieldValues;
        } else {
            // Try as JSON
            const jsonStr = args.slice(1).join(' ');
            try {
                changes = JSON.parse(jsonStr);
            } catch {
                io.stderr.write('update: invalid JSON\n');
                return 1;
            }
        }
    } else {
        // Read from stdin
        const chunks: string[] = [];
        for await (const chunk of io.stdin) {
            chunks.push(chunk.toString());
        }
        const jsonStr = chunks.join('');

        if (!jsonStr.trim()) {
            io.stderr.write('update: no data provided\n');
            return 1;
        }

        try {
            changes = JSON.parse(jsonStr);
        } catch {
            io.stderr.write('update: invalid JSON\n');
            return 1;
        }
    }

    try {
        // Verify path is a file (record)
        const stat = await fs.stat(resolved);
        if (stat.type !== 'file') {
            io.stderr.write(`update: ${pathArg}: not a record (use path to specific record)\n`);
            return 1;
        }

        // Read existing record
        const existing = await fs.read(resolved);
        const record = JSON.parse(existing.toString());

        // Merge changes (shallow merge, changes override existing)
        const updated = { ...record, ...changes };

        // Write back
        await fs.write(resolved, JSON.stringify(updated));

        // Read back to get the full record
        const result = await fs.read(resolved);
        io.stdout.write(result.toString() + '\n');

        return 0;
    } catch (err) {
        if (err instanceof FSError) {
            if (err.code === 'ENOENT') {
                io.stderr.write(`update: ${pathArg}: not found\n`);
            } else {
                io.stderr.write(`update: ${pathArg}: ${err.message}\n`);
            }
            return 1;
        }
        throw err;
    }
};
