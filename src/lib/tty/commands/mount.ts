/**
 * mount - Mount filesystems or display mounted filesystems
 *
 * Usage:
 *   mount                              List all mounts
 *   mount -t local <source> <target>   Mount local directory
 *   mount -t local -r <source> <target> Mount read-only
 *
 * Examples:
 *   mount
 *   mount -t local /real/path/to/dist /dist
 *   mount -t local -r ~/projects /projects
 */

import { LocalMount } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const mount: CommandHandler = async (session, fs, args, io) => {
    if (!fs) {
        io.stderr.write('mount: filesystem not available\n');
        return 1;
    }

    // No args: list mounts
    if (args.length === 0) {
        const mounts = fs.getMounts();

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
    }

    // Parse mount arguments
    let type: string | undefined;
    let readonly = false;
    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-t' && args[i + 1]) {
            type = args[++i];
        } else if (arg === '-r' || arg === '--readonly') {
            readonly = true;
        } else if (!arg.startsWith('-')) {
            positional.push(arg);
        }
    }

    if (!type) {
        io.stderr.write('mount: missing type (-t)\n');
        io.stderr.write('Usage: mount -t local <source> <target>\n');
        return 1;
    }

    if (positional.length !== 2) {
        io.stderr.write('mount: requires source and target paths\n');
        io.stderr.write('Usage: mount -t local <source> <target>\n');
        return 1;
    }

    const [source, target] = positional;

    // Handle mount types
    switch (type) {
        case 'local': {
            // Source is a real filesystem path on the HOST
            // Note: ~ expands to the SERVER's home, not the virtual session home
            let realPath = source;
            if (realPath.startsWith('~/')) {
                const serverHome = process.env.HOME || '/root';
                realPath = serverHome + realPath.slice(1);
            } else if (realPath === '~') {
                realPath = process.env.HOME || '/root';
            }

            // Target is a virtual filesystem path
            const virtualPath = resolvePath(session.cwd, target);

            try {
                const localMount = new LocalMount(realPath, {
                    writable: !readonly,
                });

                // Mount on current FS
                fs.mount(virtualPath, localMount);

                // Store in session for persistence across transactions
                session.mounts.set(virtualPath, {
                    type: 'local',
                    path: realPath,
                    readonly,
                });

                io.stdout.write(`Mounted ${realPath} on ${virtualPath}${readonly ? ' (read-only)' : ''}\n`);
                return 0;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                io.stderr.write(`mount: ${message}\n`);
                return 1;
            }
        }

        default:
            io.stderr.write(`mount: unknown type '${type}'\n`);
            io.stderr.write('Supported types: local\n');
            return 1;
    }
};
