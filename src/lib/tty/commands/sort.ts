/**
 * sort - Sort lines of text
 *
 * Usage:
 *   sort [-rnu] [file]    Sort lines
 *   <input> | sort        Read from stdin
 *
 * Examples:
 *   sort /tmp/list.txt
 *   sort -r /tmp/list.txt
 *   find . | sort
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const sort: CommandHandler = async (session, fs, args, io) => {
    // Parse options
    let reverse = false;
    let numeric = false;
    let unique = false;
    let file: string | undefined;

    for (const arg of args) {
        if (arg.startsWith('-') && arg !== '-') {
            for (const char of arg.slice(1)) {
                if (char === 'r') reverse = true;
                else if (char === 'n') numeric = true;
                else if (char === 'u') unique = true;
            }
        } else {
            file = arg;
        }
    }

    // Read from file or stdin
    let content: string;

    if (file) {
        if (!fs) {
            io.stderr.write('sort: filesystem not available\n');
            return 1;
        }
        const resolved = resolvePath(session.cwd, file);
        try {
            const data = await fs.read(resolved);
            content = data.toString();
        } catch (err) {
            if (err instanceof FSError) {
                io.stderr.write(`sort: ${file}: ${err.message}\n`);
                return 1;
            }
            throw err;
        }
    } else {
        // Read from stdin
        let buffer = '';
        for await (const chunk of io.stdin) {
            buffer += chunk.toString();
        }
        content = buffer;
    }

    // Split into lines
    let lines = content.split('\n');

    // Remove trailing empty line if content ends with newline
    if (lines[lines.length - 1] === '') {
        lines.pop();
    }

    // Sort
    if (numeric) {
        lines.sort((a, b) => {
            const numA = parseFloat(a) || 0;
            const numB = parseFloat(b) || 0;
            return numA - numB;
        });
    } else {
        lines.sort((a, b) => a.localeCompare(b));
    }

    if (reverse) {
        lines.reverse();
    }

    if (unique) {
        lines = [...new Set(lines)];
    }

    // Output
    for (const line of lines) {
        io.stdout.write(line + '\n');
    }

    return 0;
};
