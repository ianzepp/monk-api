/**
 * mount - Display mounted filesystems
 */

import type { CommandHandler } from './shared.js';

export const mount: CommandHandler = async (_session, fs, _args, io) => {
    const mounts = fs!.getMounts();

    if (mounts.size === 0) {
        io.stdout.write('No mounts\n');
        return 0;
    }

    // Sort by mount path
    const sorted = [...mounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [path, handler] of sorted) {
        const type = handler.constructor.name;
        io.stdout.write(`${type} on ${path}\n`);
    }
    return 0;
};
