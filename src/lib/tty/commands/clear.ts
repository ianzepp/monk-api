/**
 * clear - Clear screen
 */

import type { CommandHandler } from './shared.js';

export const clear: CommandHandler = async (_session, _fs, _args, write) => {
    write('\x1b[2J\x1b[H');
};
