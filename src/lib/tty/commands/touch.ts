/**
 * touch - Create empty file
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const touch: CommandHandler = async (session, fs, args, write) => {
    if (args.length === 0) {
        write('touch: missing operand\n');
        return;
    }

    for (const arg of args) {
        const resolved = resolvePath(session.cwd, arg);

        try {
            const exists = await fs.exists(resolved);
            if (!exists) {
                await fs.write(resolved, '');
            }
        } catch (err) {
            if (err instanceof FSError) {
                write(`touch: ${arg}: ${err.message}\n`);
            } else {
                throw err;
            }
        }
    }
};
