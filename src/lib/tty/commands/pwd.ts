/**
 * pwd - Print working directory
 */

import type { CommandHandler } from './shared.js';

export const pwd: CommandHandler = async (session, _fs, _args, write) => {
    write(session.cwd + '\n');
};
