/**
 * ls - List directory contents
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';
import { formatEntry } from './shared.js';

export const ls: CommandHandler = async (session, fs, args, write) => {
    const longFormat = args.includes('-l');
    const showAll = args.includes('-a');
    const target = args.find(a => !a.startsWith('-')) || session.cwd;
    const resolved = resolvePath(session.cwd, target);

    try {
        const stat = await fs.stat(resolved);

        if (stat.type !== 'directory') {
            // Single file
            write(formatEntry(stat, longFormat) + '\n');
            return;
        }

        const entries = await fs.readdir(resolved);

        // Sort entries: directories first, then alphabetically
        entries.sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
        });

        if (longFormat) {
            write(`total ${entries.length}\n`);
            for (const entry of entries) {
                if (!showAll && entry.name.startsWith('.')) continue;
                write(formatEntry(entry, true) + '\n');
            }
        } else {
            const names = entries
                .filter(e => showAll || !e.name.startsWith('.'))
                .map(e => e.name + (e.type === 'directory' ? '/' : ''));
            write(names.join('  ') + '\n');
        }
    } catch (err) {
        if (err instanceof FSError) {
            write(`ls: ${target}: ${err.message}\n`);
        } else {
            throw err;
        }
    }
};
