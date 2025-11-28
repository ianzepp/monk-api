/**
 * grep - Search for patterns in input
 *
 * Usage:
 *   grep <pattern>           Filter stdin lines matching pattern
 *   grep -i <pattern>        Case-insensitive match
 *   grep -v <pattern>        Invert match (show non-matching lines)
 *
 * Examples:
 *   find . | grep users      Find paths containing "users"
 *   ls -l | grep -i json     Case-insensitive search
 *   cat file | grep -v test  Exclude lines with "test"
 */

import type { CommandHandler } from './shared.js';

export const grep: CommandHandler = async (_session, _fs, args, io) => {
    const ignoreCase = args.includes('-i');
    const invertMatch = args.includes('-v');
    const pattern = args.find(a => !a.startsWith('-'));

    if (!pattern) {
        io.stderr.write('grep: missing pattern\n');
        io.stderr.write('Usage: grep [-i] [-v] <pattern>\n');
        return 1;
    }

    let regex: RegExp;
    try {
        regex = new RegExp(pattern, ignoreCase ? 'i' : '');
    } catch {
        io.stderr.write(`grep: invalid pattern: ${pattern}\n`);
        return 1;
    }

    let matchCount = 0;

    // Process stdin line by line
    let buffer = '';
    for await (const chunk of io.stdin) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');

        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
            const matches = regex.test(line);
            if (invertMatch ? !matches : matches) {
                io.stdout.write(line + '\n');
                matchCount++;
            }
        }
    }

    // Process any remaining content
    if (buffer) {
        const matches = regex.test(buffer);
        if (invertMatch ? !matches : matches) {
            io.stdout.write(buffer + '\n');
            matchCount++;
        }
    }

    // Exit code 1 if no matches (standard grep behavior)
    return matchCount > 0 ? 0 : 1;
};
