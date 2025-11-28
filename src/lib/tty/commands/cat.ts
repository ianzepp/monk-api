/**
 * cat - Display file contents
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const cat: CommandHandler = async (session, fs, args, write) => {
    if (args.length === 0) {
        write('cat: missing operand\n');
        return;
    }

    for (const arg of args) {
        if (arg.startsWith('-')) continue;
        const resolved = resolvePath(session.cwd, arg);

        try {
            const content = await fs.read(resolved);
            write(content.toString());
            if (!content.toString().endsWith('\n')) {
                write('\n');
            }
        } catch (err) {
            if (err instanceof FSError) {
                write(`cat: ${arg}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};
