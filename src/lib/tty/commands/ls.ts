/**
 * ls - List directory contents
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';
import { formatEntry } from './shared.js';

export const ls: CommandHandler = async (session, fs, args, io) => {
    const longFormat = args.includes('-l');
    const showAll = args.includes('-a');
    const target = args.find(a => !a.startsWith('-')) || session.cwd;
    const resolved = resolvePath(session.cwd, target);

    try {
        const stat = await fs!.stat(resolved);

        if (stat.type !== 'directory') {
            // Single file
            io.stdout.write(formatEntry(stat, longFormat) + '\n');
            return 0;
        }

        const entries = await fs!.readdir(resolved);

        // Sort entries: directories first, then alphabetically
        entries.sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
        });

        if (longFormat) {
            io.stdout.write(`total ${entries.length}\n`);
            for (const entry of entries) {
                if (!showAll && entry.name.startsWith('.')) continue;
                io.stdout.write(formatEntry(entry, true) + '\n');
            }
        } else {
            const names = entries
                .filter(e => showAll || !e.name.startsWith('.'))
                .map(e => e.name + (e.type === 'directory' ? '/' : ''));
            io.stdout.write(names.join('  ') + '\n');
        }
        return 0;
    } catch (err) {
        if (err instanceof FSError) {
            io.stderr.write(`ls: ${target}: ${err.message}\n`);
            return 1;
        }
        throw err;
    }
};
