/**
 * cd - Change directory
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const cd: CommandHandler = async (session, fs, args, write) => {
    const target = args[0] || '/';
    const resolved = resolvePath(session.cwd, target);

    try {
        const stat = await fs.stat(resolved);
        if (stat.type !== 'directory') {
            write(`cd: ${target}: Not a directory\n`);
            return;
        }
        session.cwd = resolved;
    } catch (err) {
        if (err instanceof FSError) {
            write(`cd: ${target}: ${err.message}\n`);
        } else {
            throw err;
        }
    }
};
