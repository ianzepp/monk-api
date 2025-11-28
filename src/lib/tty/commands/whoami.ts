/**
 * whoami - Display current user
 */

import type { CommandHandler } from './shared.js';

export const whoami: CommandHandler = async (session, _fs, _args, write) => {
    write(session.username + '\n');
};
