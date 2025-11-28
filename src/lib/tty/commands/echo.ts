/**
 * echo - Output text
 */

import type { CommandHandler } from './shared.js';

export const echo: CommandHandler = async (_session, _fs, args, write) => {
    write(args.join(' ') + '\n');
};
