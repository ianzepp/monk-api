/**
 * mv - Move/rename file or directory
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const mv: CommandHandler = async (session, fs, args, write) => {
    const files = args.filter(a => !a.startsWith('-'));

    if (files.length < 2) {
        write('mv: missing destination\n');
        return;
    }

    const dest = resolvePath(session.cwd, files.pop()!);
    const sources = files.map(f => resolvePath(session.cwd, f));

    for (const src of sources) {
        try {
            await fs.rename(src, dest);
        } catch (err) {
            if (err instanceof FSError) {
                write(`mv: ${src}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};
