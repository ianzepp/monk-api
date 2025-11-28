/**
 * rmdir - Remove directory
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const rmdir: CommandHandler = async (session, fs, args, write) => {
    if (args.length === 0) {
        write('rmdir: missing operand\n');
        return;
    }

    for (const dir of args) {
        if (dir.startsWith('-')) continue;
        const resolved = resolvePath(session.cwd, dir);

        try {
            await fs.rmdir(resolved);
        } catch (err) {
            if (err instanceof FSError) {
                write(`rmdir: ${dir}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};
