/**
 * exit/logout/quit - End session and close connection
 */

import { saveHistory } from '../session-handler.js';
import type { CommandHandler } from './shared.js';

export const exit: CommandHandler = async (session, _fs, _args, io) => {
    // Save command history
    await saveHistory(session);

    io.stdout.write('Goodbye!\n');

    // Run cleanup handlers
    for (const cleanup of session.cleanupHandlers) {
        try {
            cleanup();
        } catch {
            // Ignore cleanup errors
        }
    }
    session.cleanupHandlers = [];

    // Signal to close the connection
    session.shouldClose = true;
    return 0;
};

// Aliases
export const logout = exit;
export const quit = exit;
