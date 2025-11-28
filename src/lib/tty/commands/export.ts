/**
 * export - Set environment variable
 */

import type { CommandHandler } from './shared.js';

const exportCmd: CommandHandler = async (session, _fs, args, write) => {
    for (const arg of args) {
        const eq = arg.indexOf('=');
        if (eq > 0) {
            const key = arg.slice(0, eq);
            const value = arg.slice(eq + 1);
            session.env[key] = value;
        } else {
            write(`export: ${arg}: invalid format (use KEY=value)\n`);
        }
    }
};

export { exportCmd as export };
