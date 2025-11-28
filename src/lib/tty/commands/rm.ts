/**
 * rm - Remove file
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const rm: CommandHandler = async (session, fs, args, io) => {
    const force = args.includes('-f');
    const files = args.filter(a => !a.startsWith('-'));

    if (files.length === 0) {
        io.stderr.write('rm: missing operand\n');
        return 1;
    }

    let exitCode = 0;
    for (const file of files) {
        const resolved = resolvePath(session.cwd, file);

        try {
            await fs!.unlink(resolved);
        } catch (err) {
            if (err instanceof FSError) {
                if (!force) {
                    io.stderr.write(`rm: ${file}: ${err.message}\n`);
                    exitCode = 1;
                }
            } else {
                throw err;
            }
        }
    }
    return exitCode;
};
