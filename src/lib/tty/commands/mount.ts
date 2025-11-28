/**
 * mount - Display mounted filesystems
 */

import type { CommandHandler } from './shared.js';

export const mount: CommandHandler = async (session, fs, args, write) => {
    const mounts = fs.getMounts();

    if (mounts.size === 0) {
        write('No mounts\n');
        return;
    }

    // Sort by mount path
    const sorted = [...mounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [path, handler] of sorted) {
        const type = handler.constructor.name;
        write(`${type} on ${path}\n`);
    }
};
