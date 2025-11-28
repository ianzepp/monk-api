/**
 * umount - Unmount a filesystem
 *
 * Usage:
 *   umount <mountpoint>
 *
 * Examples:
 *   umount /dist
 *   umount /projects
 */

import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const umount: CommandHandler = async (session, fs, args, io) => {
    if (!fs) {
        io.stderr.write('umount: filesystem not available\n');
        return 1;
    }

    if (args.length === 0) {
        io.stderr.write('umount: missing mountpoint\n');
        io.stderr.write('Usage: umount <mountpoint>\n');
        return 1;
    }

    const target = args[0];
    const virtualPath = resolvePath(session.cwd, target);

    // Check if mount exists
    const mounts = fs.getMounts();
    if (!mounts.has(virtualPath)) {
        io.stderr.write(`umount: ${virtualPath}: not mounted\n`);
        return 1;
    }

    try {
        fs.unmount(virtualPath);
        io.stdout.write(`Unmounted ${virtualPath}\n`);
        return 0;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        io.stderr.write(`umount: ${message}\n`);
        return 1;
    }
};
