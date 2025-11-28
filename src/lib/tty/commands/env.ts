/**
 * env - Display environment variables
 */

import type { CommandHandler } from './shared.js';

export const env: CommandHandler = async (session, _fs, _args, write) => {
    for (const [key, value] of Object.entries(session.env)) {
        write(`${key}=${value}\n`);
    }
};
